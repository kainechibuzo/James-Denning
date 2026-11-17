// Offline planning/packaging only. This script never contacts Supabase, reads
// credentials, applies SQL or deploys functions. The reviewed workflow owns deploy.
import {readFileSync,readdirSync,lstatSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,relative,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
export const RELEASE_FUNCTIONS=Object.freeze(['jd-automation','jd-execution-worker','jd-mcp']);
export const RELEASE_JWT=Object.freeze({'jd-automation':true,'jd-execution-worker':false,'jd-mcp':false});
const production='thklwiybjuhrjqrrxyid';
const protectedProjects=new Set([production,'mcdcwdfdpqzrzsixmrcg']);
const sha=value=>typeof value==='string'&&/^[0-9a-f]{40}$/.test(value);
const fail=message=>{throw Error(message);};
export function validateBackendRelease(input){
 if(!['staging','production'].includes(input.stage))fail('Choose an explicit staging or production release.');
 if(!sha(input.sourceSha)||input.sourceSha!==input.expectedSha)fail('Release SHA must match the checked-out commit exactly.');
 if(input.approvedSha!==input.sourceSha)fail('Independent release approval for this exact SHA is missing.');
 if(input.confirmation!=='deploy-reviewed-jd-backend')fail('Explicit release confirmation is required.');
 if(typeof input.approvalReference!=='string'||!/^https:\/\/github\.com\/kainechibuzo\/James-Denning\/(?:issues|pull)\/\d+(?:#(?:issuecomment|discussion_r|pullrequestreview)-\d+)?$/.test(input.approvalReference))fail('A repository review/evidence reference is required.');
 if(typeof input.projectRef!=='string'||!/^[a-z]{20}$/.test(input.projectRef))fail('A canonical project reference is required.');
 if(input.stage==='staging'){
  if(protectedProjects.has(input.projectRef)||input.projectRef!==input.stagingProjectRef)fail('Staging must be an independently allowlisted non-production project.');
 }else{
  if(input.projectRef!==production)fail('Production project does not match this application.');
  if(input.stagingVerifiedSha!==input.sourceSha)fail('Independent isolated-staging acceptance for this exact SHA is missing.');
 }
 return {format:1,sourceSha:input.sourceSha,stage:input.stage,projectRef:input.projectRef,approvalReference:input.approvalReference,assignmentRelease:'legacy',functions:[...RELEASE_FUNCTIONS],migrations:'excluded'};
}
const hash=data=>createHash('sha256').update(data).digest('hex');
function safeRead(root,path){
 const full=resolve(root,path);if(relative(root,full).startsWith('..'))fail('Source path escapes repository.');
 // Reject symlinks in every component, not only the leaf.
 let walk=root;for(const part of relative(root,full).split('/')){walk=join(walk,part);if(lstatSync(walk).isSymbolicLink())fail('Symlinks are not permitted in release sources.');}
 return readFileSync(full);
}
export function collectBackendReleaseFiles(root){
 root=resolve(root);const files=new Map();
 const frontend=safeRead(root,'src/chat/operational-task-writes.mjs').toString();
 const backend=safeRead(root,'supabase/functions/_shared/jd-task-assignment-release.mjs').toString();
 if(!/export const TASK_ASSIGNMENT_RELEASE = "legacy";/.test(frontend)||!/export const BACKEND_TASK_ASSIGNMENT_RELEASE = 'legacy';/.test(backend))fail('This compatibility release requires both shipping assignment modes to remain legacy.');
 const config=safeRead(root,'supabase/config.toml').toString();
 for(const name of RELEASE_FUNCTIONS){
  const block=config.split(`[functions.${name}]`)[1]?.split(/\n\s*\[/)[0];
  if(!block||!new RegExp(`^verify_jwt = ${RELEASE_JWT[name]}$`,'m').test(block))fail('Function JWT configuration differs from the reviewed release contract.');
  files.set(`supabase/functions/${name}/index.ts`,safeRead(root,`supabase/functions/${name}/index.ts`));
 }
 const automation=files.get('supabase/functions/jd-automation/index.ts').toString();
 if(!automation.includes('import { handleReleasedTaskAssignment } from "../_shared/jd-task-assignment-release.mjs";')||!automation.includes('return handleReleasedTaskAssignment({admin,profile,actorId:authData.user.id,payload,json});'))fail('Authenticated assignment release router is not wired as reviewed.');
 const shared='supabase/functions/_shared';
 for(const name of readdirSync(resolve(root,shared)).sort()){
  if(!/\.(?:ts|mjs)$/.test(name)||name.endsWith('.test.ts'))continue;
  const data=safeRead(root,`${shared}/${name}`);
  files.set(`${shared}/${name}`,data);
  // This entrypoint uses ./_shared imports; stage both .ts and .mjs helpers.
  files.set(`supabase/functions/jd-execution-worker/_shared/${name}`,data);
 }
 // Only deployment JWT settings are carried over, not auth settings, migrations
 // or a production project binding. --project-ref selects the approved target.
 files.set('supabase/config.toml',Buffer.from('project_id = "jd-reviewed-backend"\n\n'+RELEASE_FUNCTIONS.map(name=>`[functions.${name}]\nverify_jwt = ${RELEASE_JWT[name]}\n`).join('\n')));
 return files;
}
function walkFiles(root,path=''){
 return readdirSync(resolve(root,path)).sort().flatMap(name=>{
  const rel=path?`${path}/${name}`:name,stat=lstatSync(resolve(root,rel));
  if(stat.isSymbolicLink())fail('Artifact symlinks are forbidden.');
  return stat.isDirectory()?walkFiles(root,rel):[rel];
 });
}
export function writeBackendArtifact(root,plan){
 const files=collectBackendReleaseFiles(root);
 const output=resolve(root,'build/jd-backend-release');
 if(existsSync(output))fail('Release output already exists; use a fresh checkout instead of overwriting evidence.');
 // Reject a preexisting build symlink before writing outside the repository.
 if(existsSync(resolve(root,'build'))&&lstatSync(resolve(root,'build')).isSymbolicLink())fail('Release output parent must not be a symlink.');
 mkdirSync(output,{recursive:true});
 for(const [path,data] of files){const full=resolve(output,path);mkdirSync(dirname(full),{recursive:true});writeFileSync(full,data);}
 const manifest={...plan,dependencyResolution:'Source artifact only; remote npm dependency resolution is not locked or independently verified by this manifest.',files:[...files].sort(([a],[b])=>a.localeCompare(b)).map(([path,data])=>({path,sha256:hash(data)}))};
 writeFileSync(resolve(output,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 verifyBackendArtifact(root,plan);return {output,manifest};
}
export function verifyBackendArtifact(root,plan){
 const output=resolve(root,'build/jd-backend-release');
 if(lstatSync(output).isSymbolicLink()||lstatSync(resolve(root,'build')).isSymbolicLink())fail('Release output must not be a symlink.');
 const manifest=JSON.parse(readFileSync(resolve(output,'release-manifest.json'),'utf8'));
 for(const key of Object.keys(plan))if(JSON.stringify(manifest[key])!==JSON.stringify(plan[key]))fail('Artifact plan does not match this approved release.');
 const expected=collectBackendReleaseFiles(root);
 const paths=walkFiles(output).filter(p=>p!=='release-manifest.json');
 if(JSON.stringify(paths.sort())!==JSON.stringify([...expected.keys()].sort()))fail('Artifact contains missing or unexpected files.');
 if(!Array.isArray(manifest.files)||manifest.files.length!==expected.size||new Set(manifest.files.map(f=>f.path)).size!==expected.size)fail('Artifact manifest file set is invalid.');
 for(const [path,data] of expected){
  if(hash(safeRead(output,path))!==hash(data)||manifest.files.find(f=>f.path===path)?.sha256!==hash(data))fail('Artifact source integrity check failed.');
 }
 return manifest;
}
export function releaseInputFromEnvironment(env,sourceSha){
 return {stage:env.JD_RELEASE_STAGE,sourceSha,expectedSha:env.JD_RELEASE_EXPECTED_SHA,approvedSha:env.JD_BACKEND_RELEASE_APPROVED_SHA,confirmation:env.JD_RELEASE_CONFIRMATION,approvalReference:env.JD_BACKEND_APPROVAL_REFERENCE,projectRef:env.JD_BACKEND_PROJECT_REF,stagingProjectRef:env.JD_STAGING_PROJECT_REF,stagingVerifiedSha:env.JD_BACKEND_STAGING_VERIFIED_SHA};
}
function main(){
 const action=process.argv[2];if(!['--prepare','--verify'].includes(action)||process.argv.length!==3)fail('Use --prepare or --verify only. No deployment or migration command is supported.');
 const root=process.cwd();
 const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const plan=validateBackendRelease(releaseInputFromEnvironment(process.env,sourceSha));
 if(execFileSync('git',['status','--porcelain','--untracked-files=normal'],{encoding:'utf8'}).trim())fail('Release preparation requires a clean checkout.');
 const result=action==='--prepare'?writeBackendArtifact(root,plan).manifest:verifyBackendArtifact(root,plan);
 console.log(JSON.stringify({sourceSha:result.sourceSha,stage:result.stage,projectRef:result.projectRef,functions:result.functions,assignmentRelease:result.assignmentRelease,migrations:result.migrations,files:result.files.length,action}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main();}catch(error){console.error(error instanceof Error?error.message:'Release validation failed.');process.exitCode=2;}
}
