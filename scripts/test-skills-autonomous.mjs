// Phase 6 autonomous acquisition + agentic-time metering: unit tests for the
// ZIP toolkit and source index, plus real candidate SQL in isolated PGlite —
// autonomous publish provenance, per-run cost confirmation, the billable-run
// load gate and the terminal-run actual-time trigger. Nothing is executed; all
// packages are synthetic instruction text.
import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {buildZip,readZipEntries,crc32} from '../supabase/functions/_shared/jd-skills-zip.mjs';
import {AUTONOMOUS_SOURCE,AUTONOMOUS_SKILL_SOURCES,matchSkillsForTask,getAutonomousSourceEntry} from '../supabase/functions/_shared/jd-skills-source-index.mjs';
import {repackageSkillFrontmatter,selectUpstreamFiles,resolveUpstreamCommit,deriveSkillStageRequestId} from '../supabase/functions/_shared/jd-skills-acquire.ts';

const COMMIT='a'.repeat(40);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const importer=id(1),tenant=id(2),reviewer=id(3),staff=id(4),other=id(5);
const db=new PGlite();
let n;
const read=p=>readFileSync(p,'utf8');
const skillsSql='supabase/migrations/20261122120000_jd_skills_catalog.sql';
const autonomousSql='supabase/migrations/20261122210000_jd_skills_autonomous.sql';

const manifest=over=>({schemaVersion:'1',name:'Invoice Reconciler',description:'Reconciles supplier invoices against the ledger with JD-verified evidence.',
 version:'1.0.0',license:'Apache-2.0',category:'finance',tags:['synthetic','review'],specialistRoles:['finance_analyst'],
 entrypoint:'SKILL.md',instructionText:'Reconcile supplier invoices against the ledger. Produce a JD-verified summary and never move money.',
 fileCount:2,totalBytes:2048,content_hash:'c'.repeat(64),
 files:[{path:'SKILL.md',bytes:1024,role:'instruction',executed:false},{path:'LICENSE.txt',bytes:12,role:'asset',executed:false}],
 source:{kind:'autonomous_github',originalFilename:'xlsx-a1b2c3d4.zip'},...over});
const report=over=>({kind:'skills_package_report',status:'needs_review',archiveBytes:2048,entryCount:2,
 summary:'Autonomous acquisition inspected clean; publication authorised by policy jd-autonomous-v1.',errors:[],warnings:[],findings:[],
 license:{declared:'Apache-2.0',licenseFile:true,status:'declared_with_license_file'},packageHash:'b'.repeat(64),manifestHash:'c'.repeat(64),...over});

async function initialise(){
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table schools(id uuid primary key);create table profiles(id uuid primary key,school_id uuid,role text,full_name text);create schema extensions;create function extensions.digest(data bytea,algorithm text) returns bytea language sql immutable as $$select sha256(data)$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);");
 const source=read('supabase/migrations/20261111085143_jd_autonomous_automation.sql');
 for(const t of ['jd_conversations','jd_automation_runs','jd_automation_steps','jd_approvals','jd_audit_events'])await db.exec(source.match(new RegExp(`create table if not exists public\\.${t} \\([\\s\\S]*?\\n\\);`))[0]);
 await db.exec(read(skillsSql));
 await db.exec(read(autonomousSql));
 await db.query('insert into schools values($1),($2)',[tenant,other]);
 for(const [who,school,role] of [[importer,tenant,'owner'],[reviewer,tenant,'admin'],[staff,tenant,'staff'],[other,other,'owner']]){
  await db.query('insert into auth.users values($1)',[who]);await db.query('insert into profiles values($1,$2,$3,$4)',[who,school,role,'Synthetic actor']);
 }
}
before(initialise);
beforeEach(async()=>{n=100;await db.exec('reset role;truncate jd_skill_packages,jd_skill_imports,jd_skills,jd_skill_versions,jd_skill_reviews,jd_skill_run_references,jd_skill_requests,jd_skill_acquisitions,jd_agent_time_ledger,jd_audit_events,jd_automation_runs cascade');});
after(()=>db.close());
async function rpc(name,args,role='service_role'){
 await db.exec(`set role ${role}`);
 try{return(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args.map(x=>x!==null&&typeof x==='object'?JSON.stringify(x):x))).rows[0].result;}
 finally{await db.exec('reset role');}
}
const expectFail=async (promise,code)=>{
 try{await promise;}catch(e){if(code&&e.code!==code)throw Error(`Expected ${code}, got ${e.code||'(none)'}: ${e.message}`);return e.message||'failed';}
 throw Error(`Expected failure ${code||''} but the call succeeded`);
};
const createImport=async(who=importer,request=id(n++),filename='xlsx-a1b2c3d4.zip')=>(await rpc('jd_create_skill_import',[who,request,filename])).import_id;
const completeImport=(imp,who=importer,request=id(n++),rep=report(),man=manifest(),pkg=null)=>rpc('jd_complete_skill_import',[who,request,imp,pkg||rep.packageHash||'b'.repeat(64),rep,man]);
const createRun=(who=importer,request=id(n++))=>db.query('insert into jd_automation_runs(school_id,requested_by,status,request_text) values($1,$2,$3,$4) returning id',[tenant,who,'queued','Synthetic acquisition run']);

test('acquisition stages use distinct deterministic idempotency keys',async()=>{
 const request=id(909);
 const create=await deriveSkillStageRequestId(request,'import.create');
 const complete=await deriveSkillStageRequestId(request,'import.complete');
 const publish=await deriveSkillStageRequestId(request,'import.publish');
 assert.match(create,/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(await deriveSkillStageRequestId(request,'import.create'),create,'retry must reproduce the same create key');
 assert.equal(await deriveSkillStageRequestId(request,'import.complete'),complete,'retry must reproduce the same completion key');
 assert.equal(await deriveSkillStageRequestId(request,'import.publish'),publish,'retry must reproduce the same publication key');
 assert.equal(new Set([create,complete,publish]).size,3,'different stages must never collide');
 await assert.rejects(()=>deriveSkillStageRequestId('not-a-uuid','import.create'),/Invalid skill acquisition request identifier/);
});

test('zip toolkit: writer/reader roundtrip with deflate and stored entries',async()=>{
 const bytes=new TextEncoder().encode('Reconcile supplier invoices against the ledger. '.repeat(40));
 const zip=await buildZip([
  {path:'SKILL.md',data:bytes},
  {path:'LICENSE.txt',data:new TextEncoder().encode('Apache License 2.0'),store:true},
 ]);
 assert.equal(new DataView(zip.buffer,zip.byteOffset,zip.byteLength).getUint32(0,true),0x04034b50);
 const {entries,extract}=readZipEntries(zip);
 assert.equal(entries.length,2);
 assert.deepEqual(entries.map(e=>e.path),['SKILL.md','LICENSE.txt']);
 const skill=await extract(entries[0]);
 assert.deepEqual(skill,bytes);
 const licence=await extract(entries[1]);
 assert.equal(new TextDecoder().decode(licence),'Apache License 2.0');
});

test('zip toolkit: corruption and path-safety are detected',async()=>{
 const zip=await buildZip([{path:'SKILL.md',data:new TextEncoder().encode('Instruction text for the synthetic package.')}]);
 const {entries,extract}=readZipEntries(zip);
 assert.equal(entries.length,1);
 const corrupt=new Uint8Array(zip);corrupt[zip.length-4]^=0xff; // inside the EOCD central-directory-offset field
 assert.throws(()=>readZipEntries(corrupt),/malformed|not found|out of bounds|truncated/);
 // Flip a byte of the stored compressed payload to force a size/CRC mismatch.
 const flip=new Uint8Array(zip);flip[35]^=0x20;
 const broken=readZipEntries(flip);
 await assert.doesNotReject(()=>extract(broken.entries[0]));
 await assert.rejects(()=>extract({...broken.entries[0],uncompressedSize:broken.entries[0].uncompressedSize+1}),/size mismatch/);
 await assert.rejects(()=>buildZip([{path:'../escape.md',data:new TextEncoder().encode('x')}]),/Unsafe/);
 await assert.rejects(()=>buildZip([{path:'a.md',data:new TextEncoder().encode('x')},{path:'a.md',data:new TextEncoder().encode('y')}]),/Duplicate/);
 assert.equal(crc32(new TextEncoder().encode('hello')),crc32(new TextEncoder().encode('hello')));
});

test('repackage completes frontmatter without touching the instruction body',()=>{
 const upstream='---\nname: xlsx\ndescription: Work with spreadsheets and workbooks.\nlicense: Proprietary\n---\n\nBody stays untouched.';
 const entry={id:'xlsx',category:'documents'};
 const out=repackageSkillFrontmatter(upstream,entry);
 assert.match(out,/^---\nname: xlsx\ndescription: Work with spreadsheets and workbooks\.\nlicense: Apache-2\.0\nversion: 1\.0\.0\ncategory: documents\ntags:\n {2}- anthropic\n {2}- jd-acquired\n {2}- anthropics-skills\n---\n\nBody stays untouched\.$/);
 assert.throws(()=>repackageSkillFrontmatter('no frontmatter',entry),/no frontmatter/);
 assert.throws(()=>repackageSkillFrontmatter('---\nname: x',entry),/unterminated/);
});

test('upstream file selection keeps text only and never scripts',()=>{
 const paths=[`repo-sha/skills/xlsx/SKILL.md`,`repo-sha/skills/xlsx/LICENSE.txt`,`repo-sha/skills/xlsx/REFERENCE.md`,
  `repo-sha/skills/xlsx/examples/example.md`,`repo-sha/skills/xlsx/scripts/build.py`,`repo-sha/skills/xlsx/bin/tool`,
  `repo-sha/skills/xlsx/README`,`repo-sha/skills/xlsx/install.sh`,`repo-sha/other/SKILL.md`];
 const selected=selectUpstreamFiles(paths,'xlsx');
 assert.deepEqual(selected,[`repo-sha/skills/xlsx/LICENSE.txt`,`repo-sha/skills/xlsx/REFERENCE.md`,
  `repo-sha/skills/xlsx/SKILL.md`,`repo-sha/skills/xlsx/examples/example.md`]);
 assert.throws(()=>selectUpstreamFiles([`repo-sha/skills/docx/scripts/x.md`],'docx'),/no SKILL\.md/);
});

test('source index is allowlisted, bounded and self-consistent',()=>{
 assert.equal(AUTONOMOUS_SOURCE.repo,'anthropics/skills');
 assert.equal(AUTONOMOUS_SOURCE.policy,'jd-autonomous-v1');
 assert.ok(AUTONOMOUS_SKILL_SOURCES.length>=18);
 const ids=AUTONOMOUS_SKILL_SOURCES.map(e=>e.id);
 assert.equal(new Set(ids).size,ids.length);
 for(const entry of AUTONOMOUS_SKILL_SOURCES)assert.ok(getAutonomousSourceEntry(entry.id),'entry resolvable');
 assert.equal(getAutonomousSourceEntry('../etc/passwd'),null);
 assert.equal(getAutonomousSourceEntry('not-a-skill'),null);
});

test('task search matches the allowlisted catalogue deterministically',()=>{
 const hits=matchSkillsForTask('Reconcile this month supplier invoices against the ledger spreadsheet');
 assert.ok(hits.length>0&&hits.length<=6);
 assert.ok(hits[0].score>=hits[hits.length-1].score);
 assert.ok(hits.some(h=>h.id==='xlsx'));
 assert.deepEqual(hits[0].source,{repo:'anthropics/skills',ref:'main',path:'skills/'+hits[0].id});
 const word=matchSkillsForTask('Draft a contract letter as a word document');
 assert.ok(word.some(h=>h.id==='docx'));
 const slides=matchSkillsForTask('Build a pitch deck presentation');
 assert.ok(slides.some(h=>h.id==='pptx'));
 assert.deepEqual(matchSkillsForTask('xyzzy qwerty zxcvb'),[]);
 assert.throws(()=>matchSkillsForTask('hi'),/bounded task/);
 assert.throws(()=>matchSkillsForTask('x'.repeat(2001)),/bounded task/);
});

test('autonomous publish records provenance and publishes without fabricating a review',async()=>{
 const imp=await createImport();
 await completeImport(imp);
 const skillRow=(await db.query('select id,current_version from jd_skills where school_id=$1',[tenant])).rows[0];
 const receipt=await rpc('jd_acquire_publish_skill',[importer,id(n++),imp,
  {repo:'anthropics/skills',ref:'main',commit:COMMIT,path:'skills/xlsx',policy:'jd-autonomous-v1'},
  'Autonomous acquisition under policy jd-autonomous-v1; validated clean; never executed.']);
 assert.equal(receipt.state,'published');assert.equal(receipt.autonomous,true);assert.equal(receipt.version,1);
 assert.equal(receipt.hiring_enabled,false);assert.equal(receipt.execution_enabled,false);
 assert.equal((await db.query('select status from jd_skills where id=$1',[skillRow.id])).rows[0].status,'published');
 const acq=(await db.query('select source_repo,source_commit,policy from jd_skill_acquisitions where skill_id=$1',[skillRow.id])).rows[0];
 assert.equal(acq.source_repo,'anthropics/skills');assert.equal(acq.source_commit,COMMIT);assert.equal(acq.policy,'jd-autonomous-v1');
 const audit=(await db.query("select count(*)::int as c from jd_audit_events where event_type='skills.autonomously_published'")).rows[0];
 assert.ok(audit.c>=1);
 const reviews=(await db.query('select count(*)::int as c from jd_skill_reviews where skill_id=$1',[skillRow.id])).rows[0];
 assert.equal(reviews.c,0); // no human review happened and none may be fabricated
 // Replayed request identifier returns the stored receipt unchanged.
 const replay=await rpc('jd_acquire_publish_skill',[importer,id(n-1),imp,
  {repo:'anthropics/skills',ref:'main',commit:COMMIT,path:'skills/xlsx',policy:'jd-autonomous-v1'},
  'Autonomous acquisition under policy jd-autonomous-v1; validated clean; never executed.']);
 assert.deepEqual(replay,receipt);
});

test('autonomous publish refuses non-validated imports and off-allowlist sources',async()=>{
 const failed=await createImport();
 await completeImport(failed,importer,id(n++),report({status:'validation_failed',packageHash:'d'.repeat(64)}),null,'d'.repeat(64));
 await expectFail(rpc('jd_acquire_publish_skill',[importer,id(n++),failed,
  {repo:'anthropics/skills',ref:'main',commit:COMMIT,path:'skills/xlsx',policy:'jd-autonomous-v1'},'Attempt to publish a failed validation autonomously.']),
  '42501');
 const imp=await createImport();
 await completeImport(imp);
 await expectFail(rpc('jd_acquire_publish_skill',[importer,id(n++),imp,
  {repo:'evil/example',ref:'main',commit:COMMIT,path:'skills/xlsx',policy:'jd-autonomous-v1'},'Off-allowlist source must be refused.']),'22023');
 await expectFail(rpc('jd_acquire_publish_skill',[importer,id(n++),imp,
  {repo:'anthropics/skills',ref:'main',commit:'shortsha',path:'skills/xlsx',policy:'jd-autonomous-v1'},'Unpinned commit must be refused.']),'22023');
 await expectFail(rpc('jd_acquire_publish_skill',[importer,id(n++),imp,
  {repo:'anthropics/skills',ref:'main',commit:COMMIT,path:'skills/xlsx',policy:'human-review-v9'},'Wrong policy must be refused.']),'22023');
 await expectFail(rpc('jd_acquire_publish_skill',[staff,id(n++),imp,
  {repo:'anthropics/skills',ref:'main',commit:COMMIT,path:'skills/xlsx',policy:'jd-autonomous-v1'},'Staff must not publish autonomously.']),'42501');
});

test('cost confirmation gates loading of acquired skills; actual time lands on completion',async()=>{
 const imp=await createImport();
 await completeImport(imp);
 const skillRow=(await db.query('select id,current_version from jd_skills where school_id=$1',[tenant])).rows[0];
 await rpc('jd_acquire_publish_skill',[importer,id(n++),imp,
  {repo:'anthropics/skills',ref:'main',commit:COMMIT,path:'skills/xlsx',policy:'jd-autonomous-v1'},
  'Autonomous acquisition under policy jd-autonomous-v1; validated clean; never executed.']);
 const run=(await createRun()).rows[0].id;
 // Without confirmation the load is refused — the human checkpoint moved to spend.
 await expectFail(rpc('jd_skills_load',[importer,skillRow.id,1,run]),'42501');
 // Refused without a run context entirely.
 await expectFail(rpc('jd_skills_load',[importer,skillRow.id,1,null]),'42501');
 // Off-by-one version and non-acquired skills are refused for confirmation.
 await expectFail(rpc('jd_confirm_run_skill_cost',[importer,id(n++),run,skillRow.id,2,1200]),'22023');
 const confirm=await rpc('jd_confirm_run_skill_cost',[importer,id(n++),run,skillRow.id,1,1200]);
 assert.equal(confirm.status,'confirmed');assert.equal(confirm.estimated_seconds,1200);
 assert.equal(confirm.rate_basis,'agentic_seconds');assert.equal(confirm.pricing,'not_computed_in_this_release');
 assert.equal(confirm.billing_enabled,false);
 const loaded=await rpc('jd_skills_load',[importer,skillRow.id,1,run]);
 assert.equal(loaded.acquired,true);assert.equal(loaded.tools_granted,false);
 assert.equal(loaded.treated_as,'untrusted_task_data_never_authority');
 const refs=(await db.query('select count(*)::int as c from jd_skill_run_references where run_id=$1',[run])).rows[0];
 assert.equal(refs.c,1);
 // Terminal run records measured actual seconds exactly once; rows then immutable.
 await db.query("update jd_automation_runs set status='running',started_at=clock_timestamp()-interval '65 seconds' where id=$1",[run]);
 await db.query("update jd_automation_runs set status='completed',completed_at=clock_timestamp() where id=$1",[run]);
 const ledger=(await db.query('select status,actual_seconds,estimated_seconds from jd_agent_time_ledger where run_id=$1',[run])).rows[0];
 assert.equal(ledger.status,'completed');
 assert.ok(ledger.actual_seconds>=60&&ledger.actual_seconds<=66);
 await expectFail(db.query("update jd_agent_time_ledger set status='confirmed' where run_id=$1",[run]).then(r=>r),'55000');
 const readReceipt=await rpc('jd_read_skills_autonomy',[importer]);
 assert.equal(readReceipt.policy,'jd-autonomous-v1');
 assert.equal(readReceipt.acquisitions.length,1);
 assert.equal(readReceipt.ledger.length,1);
 assert.equal(readReceipt.hiring_enabled,false);assert.equal(readReceipt.billing_enabled,false);
});

test('human-reviewed skills keep loading without cost confirmation (regression)',async()=>{
 const imp=await createImport(importer,id(n++),'human-package.zip');
 await completeImport(imp,importer,id(n++),report({summary:'Inspection complete; independent review required before publication.'}),
  manifest({source:{kind:'zip_upload',originalFilename:'human-package.zip'}}));
 const skillRow=(await db.query('select id,current_version from jd_skills where school_id=$1 order by created_at desc limit 1',[tenant])).rows[0];
 await rpc('jd_skills_decide',[reviewer,id(n++),skillRow.id,1,'approve','Synthetic independent review note for the recorded version.']);
 await rpc('jd_skills_publish',[importer,id(n++),skillRow.id,1,'Synthetic publication note by a reviewed administrator.']);
 const loaded=await rpc('jd_skills_load',[importer,skillRow.id,1,null]);
 assert.equal(loaded.acquired,false);
 assert.equal(loaded.tools_granted,false);
});

test('clean validated imports record needs_review with their true inspection status',async()=>{
 const imp=await createImport();
 const validated=report({status:'validated',inspection_status:'validated',summary:'Autonomous acquisition inspected clean.'});
 const receipt=await completeImport(imp,importer,id(n++),validated,manifest());
 assert.equal(receipt.status,'needs_review');
 const stored=(await db.query("select status,report->>'inspection_status' as inspection from jd_skill_imports where id=$1",[imp])).rows[0];
 assert.equal(stored.status,'needs_review');
 assert.equal(stored.inspection,'validated');
});
