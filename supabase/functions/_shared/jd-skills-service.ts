// JD Skills service: secure import pipeline and lifecycle for skill packages.
// The browser never touches the quarantine bucket directly and never sends a
// report; the service downloads the uploaded archive itself, inspects it
// without executing any part of it, and records the outcome through release
// functions that enforce tenant scope, independence and immutability.
// Skill text is untrusted task data only: loading a skill never grants tools,
// execution authority, hiring or billing.
import { safeText } from './jd-business-foundation.mjs';
import { inspectSkillPackage, SKILL_PACKAGE_LIMITS, SKILLS_RELEASE_FLAG, SKILLS_STORAGE_BUCKET } from './jd-skills-package.ts';

const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const plainFile=(v:unknown)=>typeof v==='string'&&v.length>=1&&v.length<=200&&/^[A-Za-z0-9._ -]+$/.test(v)&&!/^[. -]/.test(v);

const SKILLS_ACTIONS=['skills.read','skills.resolve','skills.load','skills.import.create','skills.import.complete','skills.decide','skills.publish','skills.lifecycle'] as const;

export async function handleSkills({payload,admin,auth,actorId,profile,json,enabled=false}:{
 payload:any;admin:any;auth:any;actorId:string;profile:any;json:(body:any,status?:number)=>Response;enabled?:boolean;
}){
 if(!['owner','admin'].includes(profile?.role)||profile?.id!==actorId||!profile?.school_id)return json({error:'Workspace administrator required'},403);
 if(!enabled)return json({error:'Skills import needs a reviewed backend and database release.',releaseEnabled:false,releaseFlag:SKILLS_RELEASE_FLAG},409);
 const action=payload?.action;
 if(!(SKILLS_ACTIONS as readonly string[]).includes(action))return json({error:'Unsupported skills action'},400);
 const call=async(name:string,args:any)=>{
  const {data,error}=await admin.rpc(name,args);
  if(error)throw {dbCode:error.code};
  if(!data||typeof data!=='object'||data.hiring_enabled!==false||data.execution_enabled!==false)throw {dbCode:'receipt'};
  return data;
 };
 try{
  if(action==='skills.read'){
   if(payload.skillId!=null&&!uuid(payload.skillId))return json({error:'Invalid skill identifier'},400);
   const {data,error}=await admin.rpc('jd_read_skills_catalog',{p_actor:actorId,p_skill:payload.skillId||null});
   if(error||!data||typeof data!=='object'||!Array.isArray(data.skills))throw {dbCode:'receipt'};
   return json({catalog:data});
  }
  // Discovery and loading are available to managers running specialist work:
  // loading returns bounded untrusted instruction text for a published,
  // reviewed version and records the exact version on the run.
  if(action==='skills.resolve'||action==='skills.load'){
   if(!['owner','admin','manager'].includes(profile.role))return json({error:'Manager permission required to discover or load skills'},403);
   if(action==='skills.resolve'){
    if(typeof payload.task!=='string'||payload.task.trim().length<4||payload.task.length>2000)return json({error:'A bounded task description is required to discover skills'},400);
    const {data,error}=await admin.rpc('jd_skills_resolve',{p_actor:actorId,p_task:payload.task,p_limit:Number.isInteger(payload.limit)&&payload.limit>0&&payload.limit<=10?payload.limit:5});
    if(error||!data||typeof data!=='object'||!Array.isArray(data.skills))throw {dbCode:'receipt'};
    return json({discover:data});
   }
   if(!uuid(payload.skillId)||!Number.isInteger(payload.expectedVersion)||payload.expectedVersion<1)return json({error:'Published skill and expected version required'},400);
   if(payload.runId!=null&&!uuid(payload.runId))return json({error:'Invalid run identifier'},400);
   const receipt=await call('jd_skills_load',{p_actor:actorId,p_skill:payload.skillId,p_expected_version:payload.expectedVersion,p_run:payload.runId||null});
   if(receipt.tools_granted!==false||typeof receipt.instructions!=='string'||receipt.instructions.length<20)throw {dbCode:'receipt'};
   return json({skill:receipt});
  }
  // Every mutating action below is administrator-only, confirmed and
  // idempotent under a request identifier held by the database.
  if(payload.confirm!==true||!uuid(payload.requestId))return json({error:'Confirmation and request identifier required'},400);
  let receipt;
  if(action==='skills.import.create'){
   if(!plainFile(payload.filename))return json({error:'A plain package filename (letters, numbers, dot, dash, space; 1-200 characters) is required'},400);
   receipt=await call('jd_create_skill_import',{p_actor:actorId,p_request:payload.requestId,p_filename:payload.filename.trim()});
   // The browser uploads only to this short-lived signed target inside the
   // private quarantine bucket; it can never read anything back.
   const signed=await admin.storage.from(receipt.bucket).createSignedUploadUrl(receipt.storage_path);
   if(signed.error||!signed.data?.token)throw {dbCode:'upload'};
   receipt.upload={token:signed.data.token,path:signed.data.path,expiresInSeconds:600};
  }else if(action==='skills.import.complete'){
   if(!uuid(payload.importId))return json({error:'Invalid import identifier'},400);
   const {data:imp,error:impErr}=await admin.from('jd_skill_imports')
    .select('id,status,storage_path,report').eq('id',payload.importId).eq('school_id',profile.school_id).maybeSingle();
   if(impErr)return json({error:'Quarantined import could not be located'},503);
   if(!imp)return json({error:'Import not found in this workspace'},404);
   if(!imp.storage_path)return json({error:'Import has no quarantine target'},409);
   if(imp.status!=='awaiting_upload'&&imp.status!=='uploaded')return json({error:'Import already completed; inspect its recorded outcome instead of re-submitting'},409);
   const {data:blob,error:dlErr}=await admin.storage.from(SKILLS_STORAGE_BUCKET).download(imp.storage_path);
   if(dlErr||!blob)return json({error:'The quarantined package could not be retrieved. Re-upload the import before completing it.'},409);
   const bytes=new Uint8Array(await blob.arrayBuffer());
   let result;
   if(bytes.length===0||bytes.length>SKILL_PACKAGE_LIMITS.maxArchiveBytes){
    result={ok:false,status:'validation_failed',manifest:null,manifestHash:null,packageHash:null,entryCount:0,totalUncompressedBytes:0,
     errors:[{code:bytes.length===0?'empty_package':'archive_too_large',path:'(archive)',message:'The uploaded archive is empty or exceeds the size limit.'}],
     warnings:[],findings:[],license:{declared:null,licenseFile:false,status:'unknown'}};
   }else{
    const filename=imp.report&&typeof imp.report==='object'&&(imp.report as any).original_filename;
    result=await inspectSkillPackage(bytes,{originalFilename:typeof filename==='string'?filename:undefined});
   }
   const report={
    kind:'skills_package_report',status:result.status,archiveBytes:bytes.length,entryCount:result.entryCount??0,
    summary:result.ok?'Inspection complete; independent review required before publication.':'Inspection failed; the package was never executed.',
    errors:result.errors,warnings:result.warnings,findings:result.findings,license:result.license,
    packageHash:result.packageHash,manifestHash:result.manifestHash,
   };
   receipt=await call('jd_complete_skill_import',{p_actor:actorId,p_request:payload.requestId,p_import:payload.importId,p_package_hash:result.packageHash,p_report:report,p_manifest:result.manifest?{...result.manifest,content_hash:result.manifestHash}:null});
  }else{
   if(!uuid(payload.skillId))return json({error:'Invalid skill identifier'},400);
   let note:string;
   try{note=safeText(payload.note,'Review note',10,1000);}catch{return json({error:'A review note of 10-1000 characters without credentials is required'},400);}
   if(action==='skills.decide'){
    if(payload.decision!=='approve'&&payload.decision!=='reject')return json({error:'An explicit approve or reject decision is required'},400);
    if(!Number.isInteger(payload.expectedVersion)||payload.expectedVersion<0)return json({error:'Expected reviewable version required'},400);
    receipt=await call('jd_skills_decide',{p_actor:actorId,p_request:payload.requestId,p_skill:payload.skillId,p_expected:payload.expectedVersion,p_action:payload.decision,p_note:note});
   }else if(action==='skills.publish'){
    if(!Number.isInteger(payload.expectedVersion)||payload.expectedVersion<0)return json({error:'Expected approved version required'},400);
    receipt=await call('jd_skills_publish',{p_actor:actorId,p_request:payload.requestId,p_skill:payload.skillId,p_expected:payload.expectedVersion,p_note:note});
   }else{
    if(payload.lifecycleAction!=='revoke'&&payload.lifecycleAction!=='deprecate')return json({error:'An explicit revoke or deprecate lifecycle action is required'},400);
    receipt=await call('jd_skills_lifecycle',{p_actor:actorId,p_request:payload.requestId,p_skill:payload.skillId,p_action:payload.lifecycleAction,p_note:note});
   }
  }
  return json({receipt});
 }catch(e:any){
  const code=e?.dbCode;
  return json({error:code==='42501'?'Authority, independence or publication requirements were not met for this skills action.':code==='40001'?'Version, request or review conflict. Reload the record; reuse the same request identifier after an uncertain submission.':code==='22023'?'The skills request was rejected as invalid; nothing was changed.':code==='receipt'||code==='upload'?'Skills outcome not confirmed by the database. Reload records before retrying; do not assume the write failed.':'Skills service could not complete this request safely.'},
   code==='42501'?403:code==='40001'?409:code==='22023'?400:code==='receipt'||code==='upload'?502:503);
 }
}
