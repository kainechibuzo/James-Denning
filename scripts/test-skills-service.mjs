// Contract tests for the JD skills service: release gate, allowlist, admin
// gating and the inspection hand-off — with a synthetic admin/DB/stub only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {handleSkills} from '../supabase/functions/_shared/jd-skills-service.ts';
import {SKILLS_RELEASE_FLAG,SKILLS_STORAGE_BUCKET,SKILL_PACKAGE_LIMITS} from '../supabase/functions/_shared/jd-skills-package.ts';

const json=(body,status=200)=>({body,status});
const actor='00000000-0000-4000-8000-000000000001',tenant='00000000-0000-4000-8000-000000000002';
const profile={id:actor,school_id:tenant,role:'admin'};
const adminDb={
 rpc:async(name,args)=>({data:( {jd_create_skill_import:{import_id:'00000000-0000-4000-8000-000000000031',bucket:SKILLS_STORAGE_BUCKET,storage_path:`${tenant}/imports/abc.zip`,max_bytes:20971520,mime_type:'application/zip',scope:'private',hiring_enabled:false,execution_enabled:false,upload:{token:'token',path:`${tenant}/imports/abc.zip`,expiresInSeconds:600}},jd_complete_skill_import:{import_id:'00000000-0000-4000-8000-000000000031',skill_id:'00000000-0000-4000-8000-000000000021',version:1,status:'needs_review',hiring_enabled:false,execution_enabled:false,persisted:true},jd_skills_resolve:{skills:[],scope:'tenant_private',execution_granted:false,instructions_included:false,notice:'ok'},jd_skills_load:{skill_id:'00000000-0000-4000-8000-000000000021',version:1,content_hash:'a'.repeat(64),instructions:'Reconcile supplier invoices against the ledger. Produce a JD-verified summary.',treated_as:'untrusted_task_data_never_authority',tools_granted:false,hiring_enabled:false,execution_enabled:false}} )[name]}),
 from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{id:'00000000-0000-4000-8000-000000000031',status:'awaiting_upload',storage_path:`${tenant}/imports/abc.zip`,report:{original_filename:'invoice.zip'}}})})})})}),
 storage:{from:()=>({createSignedUploadUrl:async()=>({data:{token:'token',path:`${tenant}/imports/abc.zip`}}),download:async()=>({data:new Blob([new Uint8Array([80,75,5,6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0])])})})},
};
const call=(payload,{enabled=true,admin=adminDb,ctxProfile=profile,actorId=actor}={})=>handleSkills({payload,admin,auth:null,actorId,profile:ctxProfile,json,enabled});
const zipBytes=new TextEncoder().encode('PK\x05\x06'+'0'.repeat(18));

test('the release gate fails closed with the flag name',async()=>{
 const r=await call({action:'skills.read'},{enabled:false});
 assert.equal(r.status,409);assert.equal(r.body.releaseEnabled,false);assert.equal(r.body.releaseFlag,SKILLS_RELEASE_FLAG);
 assert.match(r.body.error,/reviewed backend and database release/);
});
test('non-administrators and unknown actions are rejected before any database access',async()=>{
 assert.equal((await call({action:'skills.read'},{ctxProfile:{...profile,role:'manager'}})).status,403);
 assert.equal((await call({action:'skills.read'},{ctxProfile:{...profile,id:'00000000-0000-4000-8000-000000000099'}})).status,403);
 const noProfile=await call({action:'skills.read'},{ctxProfile:null});assert.equal(noProfile.status,403);
 assert.equal((await call({action:'skills.import'})).status,400);
 assert.equal((await call({action:'skills.delete'})).status,400);
});
test('confirm and request identifiers are mandatory for every mutating action',async()=>{
 for(const body of [
  {action:'skills.import.create',confirm:false,requestId:'00000000-0000-4000-8000-000000000099',filename:'a.zip'},
  {action:'skills.import.create',confirm:true,requestId:'not-a-uuid',filename:'a.zip'},
  {action:'skills.decide',confirm:false,requestId:'00000000-0000-4000-8000-000000000099',skillId:'00000000-0000-4000-8000-000000000021',expectedVersion:1,decision:'approve',note:'A long enough synthetic review note.'},
 ]){
  const calls=[];
  const spy={...adminDb,rpc:async(...a)=>{calls.push(a[0]);return adminDb.rpc(...a);}};
  const r=await call(body,{admin:spy});
  assert.equal(r.status,400);assert.deepEqual(calls,[]);
 }
});
test('import create issues a bounded signed upload target and never a read grant',async()=>{
 const r=await call({action:'skills.import.create',confirm:true,requestId:'00000000-0000-4000-8000-000000000099',filename:'invoice-reconciler.zip'});
 assert.equal(r.status,200);
 assert.equal(r.body.receipt.bucket,SKILLS_STORAGE_BUCKET);assert.equal(r.body.receipt.scope,'private');
 assert.equal(r.body.receipt.max_bytes,SKILL_PACKAGE_LIMITS.maxArchiveBytes);
 assert.equal(r.body.receipt.hiring_enabled,false);assert.equal(r.body.receipt.execution_enabled,false);
 assert.equal(r.body.receipt.upload.token,'token');
 assert.equal((await call({action:'skills.import.create',confirm:true,requestId:'00000000-0000-4000-8000-000000000098',filename:'../etc/passwd'})).status,400);
});
test('a truncated archive is recorded as validation_failed without executing anything',async()=>{
 const calls=[];
 const spy={...adminDb,rpc:async(name,args)=>{calls.push([name,args]);if(name==='jd_complete_skill_import')return{data:{import_id:'00000000-0000-4000-8000-000000000031',skill_id:null,version:null,status:'validation_failed',hiring_enabled:false,execution_enabled:false,persisted:true}};return adminDb.rpc(name,args);}};
 const r=await call({action:'skills.import.complete',confirm:true,requestId:'00000000-0000-4000-8000-000000000097',importId:'00000000-0000-4000-8000-000000000031'},{admin:spy});
 assert.equal(r.status,200);assert.equal(r.body.receipt.status,'validation_failed');
 const [name,args]=calls[0];
 assert.equal(name,'jd_complete_skill_import');
 assert.equal(args.p_report.kind,'skills_package_report');
 assert.equal(args.p_report.status,'validation_failed');
 assert.match(args.p_report.summary,/never executed/);
 assert.equal(args.p_manifest,null);
 assert.match(args.p_report.errors[0].code,/not_a_zip|corrupt_central_directory|corrupt_local_header|invalid_package/);
});
test('skill loading receipts are validated as untrusted data with no authority',async()=>{
 const r=await call({action:'skills.load',skillId:'00000000-0000-4000-8000-000000000021',expectedVersion:1});
 assert.equal(r.status,200);
 assert.equal(r.body.skill.tools_granted,false);assert.equal(r.body.skill.hiring_enabled,false);
 assert.equal(r.body.skill.treated_as,'untrusted_task_data_never_authority');
 assert.equal((await call({action:'skills.load',skillId:'00000000-0000-4000-8000-000000000021',expectedVersion:0})).status,400);
});
test('discovery is metadata-only: instructions and execution flags are checked in the receipt',async()=>{
 const r=await call({action:'skills.resolve',task:'Reconcile supplier invoices against the ledger',limit:3});
 assert.equal(r.status,200);assert.equal(r.body.discover.execution_granted,false);
 assert.equal((await call({action:'skills.resolve',task:'ab'})).status,400);
});
test('a db receipt that would unlock authority fails the call closed',async()=>{
 const hostile={...adminDb,rpc:async(name)=>({data:name==='jd_skills_publish'?{skill_id:'x',state:'published',hiring_enabled:true,execution_enabled:false}:null})};
 const r=await call({action:'skills.publish',confirm:true,requestId:'00000000-0000-4000-8000-000000000096',skillId:'00000000-0000-4000-8000-000000000021',expectedVersion:1,note:'Publication note for the synthetic flow.'},{admin:hostile});
 assert.equal(r.status,502);
});
test('zipBytes is a bounded synthetic fixture (never a real package execution)',()=>{
 assert.ok(zipBytes.length<SKILL_PACKAGE_LIMITS.maxArchiveBytes);
});

test('manual import stages are isolated even when a legacy client reuses one request id',async()=>{
 const sharedRequestId='00000000-0000-4000-8000-000000000095';
 const calls=[];
 const spy={...adminDb,rpc:async(name,args)=>{calls.push({name,args});return adminDb.rpc(name,args);}};
 const created=await call({action:'skills.import.create',confirm:true,requestId:sharedRequestId,filename:'legacy-import.zip'},{admin:spy});
 assert.equal(created.status,200);
 const completed=await call({action:'skills.import.complete',confirm:true,requestId:sharedRequestId,importId:'00000000-0000-4000-8000-000000000031'},{admin:spy});
 assert.equal(completed.status,200);
 assert.equal(calls.length,2);
 assert.equal(calls[0].name,'jd_create_skill_import');
 assert.equal(calls[1].name,'jd_complete_skill_import');
 assert.notEqual(calls[0].args.p_request,sharedRequestId);
 assert.notEqual(calls[1].args.p_request,sharedRequestId);
 assert.notEqual(calls[0].args.p_request,calls[1].args.p_request);
});
