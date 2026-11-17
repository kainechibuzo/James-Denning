import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,rmSync,copyFileSync,symlinkSync,existsSync,chmodSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {validateBackendRelease,collectBackendReleaseFiles,writeBackendArtifact,verifyBackendArtifact,RELEASE_FUNCTIONS} from './jd-backend-release.mjs';
const sourceSha='a'.repeat(40),otherSha='b'.repeat(40),staging='abcdefghijklmnopqrst';
const input={sourceSha,expectedSha:sourceSha,approvedSha:sourceSha,stage:'staging',projectRef:staging,stagingProjectRef:staging,confirmation:'deploy-reviewed-jd-backend',approvalReference:'https://github.com/kainechibuzo/James-Denning/pull/92#issuecomment-6940420006'};
const prod={...input,stage:'production',projectRef:'thklwiybjuhrjqrrxyid',stagingVerifiedSha:sourceSha};
for(const [name,patch] of [
 ['missing stage',{stage:undefined}],['unknown stage',{stage:'preview'}],['short SHA',{sourceSha:'abc'}],['different source SHA',{expectedSha:otherSha}],['missing approval',{approvedSha:undefined}],['wrong approved SHA',{approvedSha:otherSha}],['missing confirmation',{confirmation:''}],['missing evidence reference',{approvalReference:''}],['unrelated repository evidence',{approvalReference:'https://github.com/elsewhere/project/pull/1'}],['URL instead of project ref',{projectRef:'https://abcdefghijklmnopqrst.supabase.co'}],['target flag injection',{projectRef:'--project-ref prod'}],['missing independent staging allowlist',{stagingProjectRef:undefined}],['mismatched staging allowlist',{stagingProjectRef:'bcdefghijklmnopqrstu'}],['production as staging',{projectRef:'thklwiybjuhrjqrrxyid',stagingProjectRef:'thklwiybjuhrjqrrxyid'}],['legacy production as staging',{projectRef:'mcdcwdfdpqzrzsixmrcg',stagingProjectRef:'mcdcwdfdpqzrzsixmrcg'}],
])test(`release refuses ${name}`,()=>assert.throws(()=>validateBackendRelease({...input,...patch})));
for(const [name,patch] of [['missing same-SHA staging acceptance',{stagingVerifiedSha:undefined}],['different tested SHA',{stagingVerifiedSha:otherSha}],['different production target',{projectRef:staging}],['unapproved SHA',{approvedSha:otherSha}]])test(`production refuses ${name}`,()=>assert.throws(()=>validateBackendRelease({...prod,...patch})));
test('valid staged and production plans are narrow source-pinned attestations, not deployments',()=>{
 for(const item of [input,prod]){const plan=validateBackendRelease(item);assert.equal(plan.assignmentRelease,'legacy');assert.equal(plan.cancellationRelease,'legacy');assert.equal(plan.migrations,'excluded');assert.deepEqual(plan.functions,['jd-automation','jd-execution-worker','jd-mcp']);assert.equal(plan.sourceSha,sourceSha);}
});
const cache=resolve('node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(`${cache}/release-plan-`);after(()=>rmSync(temp,{recursive:true,force:true}));
let counter=0;
function fixture(){
 const root=resolve(temp,`fixture-${counter++}`);mkdirSync(root,{recursive:true});
 const source=collectBackendReleaseFiles(process.cwd());
 // Copy the real release inputs, rather than inventing an unrelated sample artifact.
 for(const [path] of source){if(path.includes('/jd-execution-worker/_shared/'))continue;const target=resolve(root,path);mkdirSync(dirname(target),{recursive:true});copyFileSync(resolve(path),target);}
 for(const path of ['src/chat/operational-task-writes.mjs','src/chat/execution-monitor.mjs']){const target=resolve(root,path);mkdirSync(dirname(target),{recursive:true});copyFileSync(resolve(path),target);}
 return root;
}
const plan=validateBackendRelease(input);
test('CI nested staging copies runtime MJS helpers as well as TypeScript',()=>{
 const workflow=readFileSync('.github/workflows/ci.yml','utf8');
 const block=workflow.split('      - name: Stage nested Edge Function shared modules\n        run: |\n')[1]?.split('\n      - name:')[0];
 assert.ok(block,'CI staging step must exist');const shell=block.split('\n').map(line=>line.replace(/^          /,'')).join('\n');
 const legacy=fixture();execFileSync('bash',['-eu','-c',shell.replace(' supabase/functions/_shared/*.mjs','')],{cwd:legacy});
 const nested='supabase/functions/jd-execution-worker/_shared/jd-agent-architect.mjs';
 assert.equal(existsSync(resolve(legacy,nested)),false,'Old TS-only staging reproduces missing runtime dependency');
 const root=fixture();execFileSync('bash',['-eu','-c',shell],{cwd:root});
 for(const name of ['jd-agent-runtime.ts','jd-agent-architect.mjs','jd-execution-cancellation.mjs','jd-usage-observer.mjs','jd-usage-service.ts','jd-agent-registry.mjs','jd-agent-registry-service.ts'])assert.deepEqual(readFileSync(resolve(root,'supabase/functions/jd-execution-worker/_shared',name)),readFileSync(resolve(root,'supabase/functions/_shared',name)));
});
test('real source bundle includes current fixes and nested worker dependencies but no SQL/secrets/unrelated functions',()=>{
 const root=fixture();const {output,manifest}=writeBackendArtifact(root,plan);assert.equal(verifyBackendArtifact(root,plan).sourceSha,sourceSha);
 const paths=manifest.files.map(f=>f.path);
 for(const required of ['supabase/functions/_shared/jd-agent-registry-service.ts','supabase/functions/_shared/jd-agent-registry.mjs','supabase/functions/jd-execution-worker/_shared/jd-agent-registry.mjs','supabase/functions/_shared/jd-usage-service.ts','supabase/functions/_shared/jd-usage-observer.mjs','supabase/functions/jd-execution-worker/_shared/jd-usage-observer.mjs','supabase/functions/_shared/jd-foundation-service.ts','supabase/functions/jd-execution-worker/_shared/jd-foundation-service.ts','supabase/functions/jd-execution-worker/_shared/jd-business-foundation.mjs','supabase/functions/jd-execution-worker/_shared/jd-research-provider.mjs','supabase/functions/_shared/jd-agent-architect.mjs','supabase/functions/jd-execution-worker/_shared/jd-agent-architect.mjs','supabase/functions/_shared/jd-execution-cancellation.mjs','supabase/functions/jd-execution-worker/_shared/jd-execution-cancellation.mjs','supabase/functions/_shared/jd-task-assignment-release.mjs','supabase/functions/_shared/jd-capability-contract.ts','supabase/functions/jd-execution-worker/_shared/jd-agent-runtime.ts','supabase/functions/jd-execution-worker/_shared/jd-task-assignment-release.mjs'])assert.ok(paths.includes(required));
 assert.ok(paths.every(p=>!p.includes('/migrations/')&&!p.endsWith('.sql')&&!p.endsWith('.test.ts')&&!p.includes('.env')));
 const functionDirs=new Set(paths.filter(p=>p.startsWith('supabase/functions/')).map(p=>p.split('/')[2]));assert.deepEqual([...functionDirs].sort(),['_shared',...RELEASE_FUNCTIONS].sort());
 const config=readFileSync(resolve(output,'supabase/config.toml'),'utf8');assert.doesNotMatch(config,/thklwiybjuhrjqrrxyid|\[auth/);assert.match(config,/\[functions.jd-automation\]\nverify_jwt = true/);
 assert.throws(()=>writeBackendArtifact(root,plan),/already exists/);
});
for(const [name,mutate] of [
 ['frontend switched early',root=>{const p=resolve(root,'src/chat/operational-task-writes.mjs');writeFileSync(p,readFileSync(p,'utf8').replace('TASK_ASSIGNMENT_RELEASE = "legacy"','TASK_ASSIGNMENT_RELEASE = "checked"'));}],
 ['backend switched early',root=>{const p=resolve(root,'supabase/functions/_shared/jd-task-assignment-release.mjs');writeFileSync(p,readFileSync(p,'utf8').replace("BACKEND_TASK_ASSIGNMENT_RELEASE = 'legacy'","BACKEND_TASK_ASSIGNMENT_RELEASE = 'checked'"));}],
 ['cancellation switched early',root=>{const p=resolve(root,'supabase/functions/_shared/jd-execution-cancellation.mjs');writeFileSync(p,readFileSync(p,'utf8').replace("BACKEND_CANCELLATION_RELEASE = 'legacy'","BACKEND_CANCELLATION_RELEASE = 'checked'"));}],
 ['cancellation client switched early',root=>{const p=resolve(root,'src/chat/execution-monitor.mjs');writeFileSync(p,readFileSync(p,'utf8').replace("EXECUTION_CANCELLATION_RELEASE = 'legacy'","EXECUTION_CANCELLATION_RELEASE = 'checked'"));}],
 ['cancellation router bypassed',root=>{const p=resolve(root,'supabase/functions/jd-automation/index.ts');writeFileSync(p,readFileSync(p,'utf8').replace('return handleExecutionCancellation(','return bypassCancellation('));}],
 ['JWT changed',root=>{const p=resolve(root,'supabase/config.toml');writeFileSync(p,readFileSync(p,'utf8').replace('[functions.jd-automation]\nverify_jwt = true','[functions.jd-automation]\nverify_jwt = false'));}],
 ['router bypassed',root=>{const p=resolve(root,'supabase/functions/jd-automation/index.ts');writeFileSync(p,readFileSync(p,'utf8').replace('return handleReleasedTaskAssignment(','return handleTaskAssignment('));}],
])test(`packaging refuses ${name}`,()=>{const root=fixture();mutate(root);assert.throws(()=>writeBackendArtifact(root,plan));assert.equal(existsSync(resolve(root,'build/jd-backend-release')),false);});
for(const [name,mutate] of [
 ['changed source file',(out)=>writeFileSync(resolve(out,'supabase/functions/jd-automation/index.ts'),'changed')],
 ['extra migration',(out)=>writeFileSync(resolve(out,'pending.sql'),'select 1')],
 ['missing file',(out)=>rmSync(resolve(out,'supabase/functions/jd-mcp/index.ts'))],
 ['changed target',(out)=>{const p=resolve(out,'release-manifest.json'),j=JSON.parse(readFileSync(p));j.projectRef='thklwiybjuhrjqrrxyid';writeFileSync(p,JSON.stringify(j));}],
 ['changed hash',(out)=>{const p=resolve(out,'release-manifest.json'),j=JSON.parse(readFileSync(p));j.files[0].sha256='0'.repeat(64);writeFileSync(p,JSON.stringify(j));}],
 ['symlink',(out)=>{const p=resolve(out,'supabase/functions/jd-mcp/index.ts');rmSync(p);symlinkSync(resolve('supabase/functions/jd-mcp/index.ts'),p);}],
])test(`artifact verification rejects ${name}`,()=>{const root=fixture(),{output}=writeBackendArtifact(root,plan);mutate(output);assert.throws(()=>verifyBackendArtifact(root,plan));});
test('output parent symlink cannot redirect artifact writes',()=>{const root=fixture(),outside=resolve(temp,'outside');mkdirSync(outside);symlinkSync(outside,resolve(root,'build'));assert.throws(()=>writeBackendArtifact(root,plan),/symlink/);assert.equal(existsSync(resolve(outside,'jd-backend-release')),false);});
test('source symlink is rejected before output creation',()=>{const root=fixture(),p=resolve(root,'supabase/functions/_shared/jd-agent-runtime.ts');rmSync(p);symlinkSync(resolve('supabase/functions/_shared/jd-agent-runtime.ts'),p);assert.throws(()=>writeBackendArtifact(root,plan),/Symlinks/);});
test('CLI with no approvals fails before artifact creation and has no network/deploy API',()=>{
 const result=spawnSync(process.execPath,['scripts/jd-backend-release.mjs','--prepare'],{cwd:process.cwd(),env:{PATH:process.env.PATH},encoding:'utf8'});assert.equal(result.status,2);assert.match(result.stderr,/explicit staging or production/);
 const script=readFileSync('scripts/jd-backend-release.mjs','utf8');assert.doesNotMatch(script,/\bfetch\s*\(|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD/);
 assert.throws(()=>execFileSync(process.execPath,['scripts/jd-backend-release.mjs','--deploy'],{stdio:'pipe'}));
});
test('manual workflow defaults to artifact-only; exact SHA, independent approvals and narrow deployment are retained',()=>{
 const workflow=readFileSync('.github/workflows/deploy.yml','utf8');const events=workflow.slice(workflow.indexOf('\non:'),workflow.indexOf('\nconcurrency:'));
 assert.doesNotMatch(events,/^\s+(push|pull_request|schedule):/m);assert.match(events,/deploy_functions:[\s\S]*?default: false/);
 assert.match(workflow,/cancel-in-progress: false/);assert.match(workflow,/if: github.ref == 'refs\/heads\/master'/);
 assert.match(workflow,/environment: supabase-\$\{\{ inputs.release_stage \}\}/);
 assert.match(workflow,/JD_BACKEND_RELEASE_APPROVED_SHA: \$\{\{ vars.JD_BACKEND_RELEASE_APPROVED_SHA \}\}/);
 assert.match(workflow,/JD_BACKEND_STAGING_VERIFIED_SHA: \$\{\{ vars.JD_BACKEND_STAGING_VERIFIED_SHA \}\}/);
 assert.match(workflow,/for function_name in jd-automation jd-execution-worker jd-mcp;/);
 assert.match(workflow,/supabase functions deploy "\$function_name" --project-ref "\$JD_BACKEND_PROJECT_REF" --workdir build\/jd-backend-release/);
 assert.doesNotMatch(workflow,/supabase db|--include-all|--no-verify-jwt|JD_SECRETS_JSON|SUPABASE_DB_PASSWORD/);
 assert.ok(workflow.indexOf('node scripts/jd-backend-release.mjs --prepare')<workflow.indexOf('SUPABASE_ACCESS_TOKEN:'));
 assert.equal(existsSync('.github/workflows/deploy.yml.'),false);
});
// Exercise the executable CLI with a synthetic git adapter, not a real release
// approval or an extra repository/branch. No credentials or network are present.
for(const dirty of [false,true])test(`CLI preparation on ${dirty?'dirty':'clean'} synthetic checkout`,()=>{
 const root=fixture(),bin=resolve(root,'test-bin');mkdirSync(bin);
 const git=resolve(bin,'git');writeFileSync(git,`#!/bin/sh\nif [ "$1" = "rev-parse" ]; then printf '%s\\n' '${sourceSha}'; elif [ "$1" = "status" ]; then printf '%s' '${dirty?' M modified-source.ts':''}'; else exit 1; fi\n`);chmodSync(git,0o755);
 const env={PATH:`${bin}:${process.env.PATH}`,JD_RELEASE_STAGE:'staging',JD_RELEASE_EXPECTED_SHA:sourceSha,JD_BACKEND_RELEASE_APPROVED_SHA:sourceSha,JD_RELEASE_CONFIRMATION:input.confirmation,JD_BACKEND_APPROVAL_REFERENCE:input.approvalReference,JD_BACKEND_PROJECT_REF:staging,JD_STAGING_PROJECT_REF:staging};
 const script=resolve('scripts/jd-backend-release.mjs');
 const result=spawnSync(process.execPath,[script,'--prepare'],{cwd:root,env,encoding:'utf8'});
 assert.equal(result.status,dirty?2:0,result.stderr);
 if(dirty){assert.match(result.stderr,/clean checkout/);assert.equal(existsSync(resolve(root,'build')),false);}
 else{assert.equal(JSON.parse(result.stdout).sourceSha,sourceSha);assert.equal(spawnSync(process.execPath,[script,'--verify'],{cwd:root,env}).status,0);}
});
