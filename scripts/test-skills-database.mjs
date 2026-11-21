// Real candidate skills-catalog SQL in isolated PGlite: quarantine import,
// independent review, publication, discovery and loading. Synthetic packages
// only; nothing is ever executed and no operational agent evaluation runs.
import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const importer=id(1),tenant=id(2),reviewer=id(3),second=id(4),staff=id(5),outside=id(6),other=id(7);
const read=p=>readFileSync(p,'utf8'),skills='supabase/migrations/20261122120000_jd_skills_catalog.sql';
let n;
const manifest=over=>({schemaVersion:'1',name:'Invoice Reconciler',description:'Reconciles supplier invoices against the ledger with JD-verified evidence.',
 version:'1.0.0',license:'MIT',category:'finance',tags:['synthetic','review'],specialistRoles:['finance_analyst'],
 entrypoint:'SKILL.md',instructionText:'Reconcile supplier invoices against the ledger. Produce a JD-verified summary and never move money.',
 fileCount:2,totalBytes:2048,content_hash:'a'.repeat(64),
 files:[{path:'SKILL.md',bytes:1024,role:'instruction',executed:false},{path:'LICENSE',bytes:12,role:'asset',executed:false}],
 source:{kind:'zip_upload',originalFilename:'invoice-reconciler.zip'},...over});
const report=over=>({kind:'skills_package_report',status:'needs_review',archiveBytes:2048,entryCount:2,
 summary:'Inspection complete; independent review required before publication.',errors:[],warnings:[],findings:[],
 license:{declared:'MIT',licenseFile:true,status:'declared_with_license_file'},packageHash:'b'.repeat(64),manifestHash:'a'.repeat(64),...over});
async function initialise(){
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table schools(id uuid primary key);create table profiles(id uuid primary key,school_id uuid,role text,full_name text);create schema extensions;create function extensions.digest(data bytea,algorithm text) returns bytea language sql immutable as $$select sha256(data)$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);");
 const source=read('supabase/migrations/20261111085143_jd_autonomous_automation.sql');
 for(const t of ['jd_conversations','jd_automation_runs','jd_automation_steps','jd_approvals','jd_audit_events'])await db.exec(source.match(new RegExp(`create table if not exists public\\.${t} \\([\\s\\S]*?\\n\\);`))[0]);
 await db.exec(read(skills));
 await db.query('insert into schools values($1),($2)',[tenant,other]);
 for(const [who,school,role] of [[importer,tenant,'owner'],[reviewer,tenant,'admin'],[second,tenant,'admin'],[staff,tenant,'staff'],[outside,other,'owner']]){
  await db.query('insert into auth.users values($1)',[who]);await db.query('insert into profiles values($1,$2,$3,$4)',[who,school,role,'Synthetic actor']);
 }
}
before(initialise);
beforeEach(async()=>{n=100;await db.exec('reset role;truncate jd_skill_packages,jd_skill_imports,jd_skills,jd_skill_versions,jd_skill_reviews,jd_skill_run_references,jd_skill_requests,jd_audit_events,jd_automation_runs cascade');});
after(()=>db.close());
async function rpc(name,args,role='service_role'){
 await db.exec(`set role ${role}`);
 try{return(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args.map(x=>x!==null&&typeof x==='object'?JSON.stringify(x):x))).rows[0].result;}
 finally{await db.exec('reset role');}
}
const createImport=(who=importer,request=id(n++),filename='invoice-reconciler.zip')=>rpc('jd_create_skill_import',[who,request,filename]);
const completeImport=(imp,who=importer,request=id(n++),pkg='b'.repeat(64),rep=report(),man=manifest())=>rpc('jd_complete_skill_import',[who,request,imp,pkg,rep,man]);
const decide=(skill,action,who=reviewer,version=1,request=id(n++),note='Synthetic independent review note for the recorded version.')=>rpc('jd_skills_decide',[who,request,skill,version,action,note]);
const publish=(skill,who=importer,version=1,request=id(n++),note='Synthetic publication note by a reviewed administrator.')=>rpc('jd_skills_publish',[who,request,skill,version,note]);
const lifecycle=(skill,action,who=reviewer,request=id(n++),note='Synthetic lifecycle note recorded with the decision.')=>rpc('jd_skills_lifecycle',[who,request,skill,action,note]);
const catalog=(who=importer,skill=null)=>rpc('jd_read_skills_catalog',[who,skill]);
const resolveSkills=(who=importer,task='Reconcile the supplier invoices against the ledger',limit=5)=>rpc('jd_skills_resolve',[who,task,limit]);
const loadSkill=(skill,version=1,run=null,who=reviewer)=>rpc('jd_skills_load',[who,skill,version,run]);
async function reviewedSkill({name='Invoice Reconciler',reviewerWho=reviewer,pkg='b'.repeat(64)}={}){
 const imp=await createImport(importer,id(n++),name==='Invoice Reconciler'?'invoice-reconciler.zip':'skill.zip');
 const done=await completeImport(imp.import_id,importer,id(n++),pkg,report(),manifest({name}));
 await decide(done.skill_id,'approve',reviewerWho,done.version);
 return {skill:done.skill_id,version:done.version,import_id:imp.import_id};
}

test('import create issues a private quarantine target with bounded receipts',async()=>{
 const r=await createImport();
 assert.equal(r.bucket,'jd-skill-packages');assert.equal(r.scope,'private');assert.equal(r.max_bytes,20971520);
 assert.equal(r.mime_type,'application/zip');assert.equal(r.hiring_enabled,false);assert.equal(r.execution_enabled,false);
 assert.match(r.storage_path,new RegExp(`^${tenant}/imports/[0-9a-f-]{36}\\.zip$`));
 const row=(await db.query('select status,storage_path from jd_skill_imports where id=$1',[r.import_id])).rows[0];
 assert.equal(row.status,'awaiting_upload');assert.equal(row.storage_path,r.storage_path);
 assert.equal((await db.query("select count(*)::int as c from jd_audit_events where event_type='skills.import_created'")).rows[0].c,1);
 const bucket=(await db.query("select public,file_size_limit,allowed_mime_types from storage.buckets where id='jd-skill-packages'")).rows[0];
 assert.equal(bucket.public,false);assert.equal(Number(bucket.file_size_limit),20971520);assert.deepEqual(bucket.allowed_mime_types,['application/zip']);
});
test('the same request identifier replays its receipt; a different request on the same identifier conflicts',async()=>{
 const request=id(n++),first=await createImport(importer,request);
 assert.equal((await createImport(importer,request)).import_id,first.import_id);
 await assert.rejects(rpc('jd_create_skill_import',[importer,request,'different-name.zip']),e=>e.code==='40001');
});
test('only workspace administrators act; other tenants cannot act on foreign imports',async()=>{
 await assert.rejects(createImport(staff),e=>e.code==='42501');
 const foreign=await rpc('jd_create_skill_import',[outside,id(n++),'foreign.zip']);
 await assert.rejects(completeImport(foreign.import_id,importer),e=>e.code==='42501');
 const local=await createImport();
 await assert.rejects(completeImport(local.import_id,outside),e=>e.code==='42501');
 assert.equal((await db.query('select count(*)::int as c from jd_skill_imports where school_id=$1 and status=$2',[other,'awaiting_upload'])).rows[0].c,1);
});
test('a quarantined package records an immutable reviewable version without execution',async()=>{
 const imp=await createImport(),request=id(n++);
 const done=await completeImport(imp.import_id,importer,request);
 assert.equal(done.status,'needs_review');assert.equal(done.persisted,true);assert.equal(done.version,1);
 assert.equal(done.hiring_enabled,false);assert.equal(done.execution_enabled,false);
 const skill=(await db.query('select id,name,scope,status,current_version from jd_skills where id=$1',[done.skill_id])).rows[0];
 assert.equal(skill.name,'Invoice Reconciler');assert.equal(skill.scope,'private');assert.equal(skill.status,'needs_review');assert.equal(skill.current_version,1);
 const version=(await db.query('select version,manifest,content_hash from jd_skill_versions where skill_id=$1',[skill.id])).rows[0];
 assert.equal(version.version,1);assert.equal(version.manifest.name,'Invoice Reconciler');assert.equal(version.content_hash,'a'.repeat(64));
 assert.equal((await db.query("select count(*)::int as c from jd_audit_events where event_type='skills.import_completed'")).rows[0].c,1);
 const replay=await completeImport(imp.import_id,importer,request);
 assert.equal(replay.skill_id,done.skill_id);assert.equal(replay.version,1);
 await assert.rejects(completeImport(imp.import_id,importer,id(n++)),e=>e.code==='40001');
});
test('importing the same skill name creates the next immutable version',async()=>{
 const first=await createImport();const v1=await completeImport(first.import_id,importer,id(n++),'c'.repeat(64));
 const second=await createImport();const v2=await completeImport(second.import_id,importer,id(n++),'d'.repeat(64));
 assert.equal(v2.version,2);assert.equal(v2.skill_id,v1.skill_id);
 assert.deepEqual((await db.query('select version from jd_skill_versions where skill_id=$1 order by version',[v1.skill_id])).rows.map(r=>r.version),[1,2]);
});
test('self-review is refused; decisions need the current reviewable version and a real note',async()=>{
 const imp=await createImport();const done=await completeImport(imp.import_id,importer,id(n++),'e'.repeat(64),report(),manifest({name:'Audit Checklist'}));
 const skill=done.skill_id,version=done.version;
 await assert.rejects(decide(skill,'approve',importer,version),e=>e.code==='42501');
 await assert.rejects(decide(skill,'approve',reviewer,version+1),e=>e.code==='40001');
 await assert.rejects(decide(skill,'maybe',reviewer,version),e=>e.code==='22023');
 await assert.rejects(decide(skill,'approve',reviewer,version,id(n++),'short'),e=>e.code==='22023');
 const ok=await decide(skill,'approve',second,version);
 assert.equal(ok.decision,'approve');assert.equal(ok.state,'approved');assert.equal(ok.execution_enabled,false);
 assert.equal((await db.query('select status,current_version from jd_skills where id=$1',[skill])).rows[0].status,'approved');
 await assert.rejects(decide(skill,'reject',reviewer,version),e=>e.code==='40001');
});
test('publication requires an approved current version with an independent recorded review',async()=>{
 const {skill,version}=await reviewedSkill({name:'Ledger Close'});
 const receipt=await publish(skill,importer,version);
 assert.equal(receipt.state,'published');assert.equal(receipt.scope,'private');
 assert.equal(receipt.hiring_enabled,false);assert.equal(receipt.execution_enabled,false);assert.equal(receipt.billing_enabled,false);
 assert.equal((await db.query('select status from jd_skills where id=$1',[skill])).rows[0].status,'published');
 await assert.rejects(publish(skill,importer,version),e=>e.code==='42501');
 const imp=await createImport(importer,id(n++),'ledger-close-2.zip');
 const done=await completeImport(imp.import_id,importer,id(n++),'c'.repeat(64),report(),manifest({name:'Ledger Close'}));
 await assert.rejects(decide(done.skill_id,'approve',importer,done.version),e=>e.code==='42501');
 await assert.rejects(publish(done.skill_id,second,done.version),e=>e.code==='42501');
});
test('discovery returns only published tenant skills as metadata, never instructions',async()=>{
 const {skill,version}=await reviewedSkill();
 await publish(skill,importer,version);
 const fresh=await reviewedSkill({name:'Ledger Auditor',pkg:'c'.repeat(64)});
 const draft=await createImport();
 const pending=await completeImport(draft.import_id,importer,id(n++),'e'.repeat(64),report(),manifest({name:'Unpublished Reconciler'}));
 const found=await resolveSkills(importer,'Reconcile supplier invoices against the ledger');
 assert.equal(found.scope,'tenant_private');assert.equal(found.execution_granted,false);assert.equal(found.instructions_included,false);
 assert.ok(found.skills.some(s=>s.id===skill),'the published skill is discoverable');
 assert.ok(!found.skills.some(s=>s.id===fresh.skill),'approved-but-unpublished skills are not discoverable');
 assert.ok(!found.skills.some(s=>s.id===pending.skill_id),'needs-review packages are not discoverable');
 assert.ok(found.skills.every(s=>!s.instructions),'no discovery result carries instruction text');
 assert.equal((await resolveSkills(outside,'Reconcile supplier invoices against the ledger')).skills.length,0,'other tenants see nothing');
 await lifecycle(skill,'revoke');
 assert.ok(!(await resolveSkills(importer,'Reconcile supplier invoices against the ledger')).skills.some(s=>s.id===skill));
 await assert.rejects(resolveSkills(importer,'ab'),e=>e.code==='22023');
});
test('loading a published skill returns bounded untrusted text and records the exact version on the run',async()=>{
 const {skill,version}=await reviewedSkill({name:'Runbook Writer'});
 await publish(skill,importer,version);
 const run=(await db.query("insert into jd_automation_runs(school_id,requested_by,trigger_type,request_text) values($1,$2,'chat','Load the runbook writer skill for a synthetic run') returning id",[tenant,importer])).rows[0].id;
 const loaded=await loadSkill(skill,version,run,reviewer);
 assert.equal(loaded.skill_id,skill);assert.equal(loaded.version,version);assert.equal(loaded.content_hash,'a'.repeat(64));
 assert.ok(loaded.instructions.length>=20);
 assert.equal(loaded.treated_as,'untrusted_task_data_never_authority');
 assert.equal(loaded.tools_granted,false);assert.equal(loaded.hiring_enabled,false);assert.equal(loaded.execution_enabled,false);
 const ref=(await db.query('select skill_id,version,run_id from jd_skill_run_references where run_id=$1',[run])).rows[0];
 assert.equal(ref.skill_id,skill);assert.equal(ref.version,version);
 await assert.rejects(loadSkill(skill,version+1,run,reviewer),e=>e.code==='40001');
 await lifecycle(skill,'revoke');
 await assert.rejects(loadSkill(skill,version,run,reviewer),e=>e.code==='42501');
});
test('a validation-failed import records evidence but creates no skill or version',async()=>{
 const imp=await createImport(importer,id(n++),'broken.zip');
 const done=await completeImport(imp.import_id,importer,id(n++),'f'.repeat(64),
  report({status:'validation_failed',summary:'Inspection failed; the package was never executed.',errors:[{code:'corrupt_central_directory',path:'(central directory)',message:'Central directory corrupt.'}]}),null);
 assert.equal(done.status,'validation_failed');assert.equal(done.skill_id,null);assert.equal(done.version,null);
 const row=(await db.query('select status,error_message,manifest,report from jd_skill_imports where id=$1',[imp.import_id])).rows[0];
 assert.equal(row.status,'validation_failed');assert.equal(row.error_message,'Inspection failed; the package was never executed.');
 assert.equal(row.manifest,null);assert.equal(row.report.kind,'skills_package_report');
 assert.equal((await db.query('select count(*)::int as c from jd_skill_packages where package_hash=$1',['f'.repeat(64)])).rows[0].c,1);
 assert.equal((await db.query('select count(*)::int as c from jd_skill_versions v join jd_skill_packages p on p.id=v.package_id where p.package_hash=$1',['f'.repeat(64)])).rows[0].c,0);
 await assert.rejects(completeImport(imp.import_id,importer,id(n++),'f'.repeat(64),report()),e=>e.code==='40001');
});
test('deprecation stops discovery and loading but keeps the immutable version and history',async()=>{
 const {skill,version}=await reviewedSkill({name:'Deprecation Target'});
 await publish(skill,importer,version);
 const r=await lifecycle(skill,'deprecate');
 assert.equal(r.state,'deprecated');assert.equal(r.execution_enabled,false);
 assert.ok(!(await resolveSkills(importer,'Reconcile supplier invoices against the ledger')).skills.some(s=>s.id===skill));
 await assert.rejects(loadSkill(skill,version,null,reviewer),e=>e.code==='42501');
 await assert.rejects(lifecycle(skill,'deprecate'),e=>e.code==='42501');
 assert.equal((await db.query('select status from jd_skills where id=$1',[skill])).rows[0].status,'deprecated');
 const v=(await db.query('select version from jd_skill_versions where skill_id=$1',[skill])).rows[0];
 assert.equal(v.version,version);
});
test('skill versions, reviews and request receipts are immutable evidence',async()=>{
 const {skill}=await reviewedSkill({name:'Immutable Evidence'});
 await assert.rejects(db.query('update jd_skill_versions set manifest=$1 where skill_id=$2',[JSON.stringify(manifest({name:'Tampered'})),skill]),e=>e.code==='55000');
 await assert.rejects(db.query("update jd_skill_reviews set note='tampered' where skill_id=$1",[skill]),e=>e.code==='55000');
 await assert.rejects(db.query("update jd_skill_requests set receipt='{\"x\":1}'::jsonb where school_id=$1",[tenant]),e=>e.code==='55000');
});
test('the tenant catalog read is scoped, bounded and never crosses tenants',async()=>{
 const {skill}=await reviewedSkill({name:'Catalog Scope'});
 const data=await catalog(importer,skill);
 assert.equal(data.skill_scope,'tenant_private');assert.equal(data.hiring_enabled,false);assert.equal(data.execution_enabled,false);
 assert.ok(data.skills.some(s=>s.id===skill));
 assert.ok(data.versions.every(v=>v.version<=data.skill_limit));
 assert.equal((await catalog(outside)).skills.length,0);
 await assert.rejects(catalog(outside,skill),e=>e.code==='42501');
});
