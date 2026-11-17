#!/usr/bin/env node
// OFFLINE ONLY: no authentication, network, SQL, deployment or approval writes.
import {readFileSync,writeFileSync,mkdirSync,lstatSync,existsSync} from 'node:fs';
import {resolve,relative,join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {CASES,REVIEW_GATES,SOURCE_FILES,assertObservation,requireEvidence as need,micros} from './lib/jd-cancellation-evidence.mjs';

const protectedProjects=new Set(['thklwiybjuhrjqrrxyid','mcdcwdfdpqzrzsixmrcg']);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sha=value=>typeof value==='string'&&/^[0-9a-f]{40}$/.test(value);
const digest=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const limit=1024*1024;
function noLinks(path){
 const absolute=resolve(path);let current=resolve('/');
 for(const part of absolute.split('/').filter(Boolean)){
  current=join(current,part);if(existsSync(current))need(!lstatSync(current).isSymbolicLink(),'Symlink paths are forbidden');
 }
}
function safeRead(root,path){
 need(typeof path==='string'&&/^[A-Za-z0-9_./-]+$/.test(path)&&!isAbsolute(path)&&!path.split('/').some(p=>!p||p==='.'||p==='..'||p==='.git'),'Invalid evidence path');
 need(/\.(json|log|txt|md)$/.test(path),'Evidence must be a redacted JSON, log, text or Markdown file');
 const file=resolve(root,path);noLinks(file);
 const stat=lstatSync(file);need(stat.isFile()&&stat.size<=limit,'Evidence file missing, nonregular or over 1 MiB');
 return readFileSync(file);
}
export function fingerprint(root){
 return Object.fromEntries(SOURCE_FILES.map(path=>{const file=resolve(root,path);noLinks(file);return[path,hash(readFileSync(file))];}));
}
export function makePlan(source){
 need(sha(source.sha)&&typeof source.dirty==='boolean','Invalid source identity');
 need(isDeepStrictEqual(Object.keys(source.files).sort(),[...SOURCE_FILES].sort())&&Object.values(source.files).every(digest),'Incomplete source fingerprint');
 return {
  schemaVersion:1,kind:'jd-cancellation-evidence-plan',source,
  environment:{kind:'unconfigured',projectRef:null},
  cases:CASES.map(c=>({id:c.id,outcome:'not-run',observation:null,attachments:[]})),
  reviewGates:REVIEW_GATES.map(g=>({id:g.id,outcome:'not-run',observedAt:null,actual:null,attachments:[]})),
 };
}
function artifact(root,entry){
 need(entry&&digest(entry.sha256),'Missing evidence digest');
 const bytes=safeRead(root,entry.path);need(hash(bytes)===entry.sha256,'Evidence digest mismatch');return bytes;
}
function attachments(root,entries){
 need(Array.isArray(entries)&&entries.length>0&&entries.length<=12,'Missing or excessive supporting artifacts');
 const paths=new Set();for(const entry of entries){need(!paths.has(entry.path),'Duplicate supporting artifact');paths.add(entry.path);need(artifact(root,entry).toString().trim().length>0,'Empty supporting artifact');}
}
export function evaluateBundle(root,plan,currentSource){
 need(plan?.schemaVersion===1&&plan.kind==='jd-cancellation-evidence-plan','Unsupported evidence plan');
 makePlan(plan.source); // Validate, but never generate success from supplied counts.
 const issues=[],results=[];
 if(!isDeepStrictEqual(plan.source,currentSource))issues.push('Source identity/fingerprint differs from the current checkout');
 if(plan.source.dirty||currentSource.dirty)issues.push('Source checkout was or is dirty; prepare a fresh plan for the reviewed commit');
 const environment=plan.environment;
 need(['unconfigured','local-simulation','isolated-staging'].includes(environment?.kind),'Invalid environment kind');
 if(environment.kind==='isolated-staging')need(typeof environment.projectRef==='string'&&/^[a-z]{20}$/.test(environment.projectRef)&&!protectedProjects.has(environment.projectRef),'Production, legacy or invalid staging target is forbidden');
 else issues.push('No isolated staging evidence: local/unconfigured inputs cannot establish live acceptance');
 if(environment.kind!=='isolated-staging')need(environment.projectRef===null,'Local/unconfigured evidence cannot declare a remote project');
 for(const [rows,specs,label] of [[plan.cases,CASES,'cases'],[plan.reviewGates,REVIEW_GATES,'review gates']]){
  need(Array.isArray(rows)&&rows.length===specs.length&&new Set(rows.map(r=>r.id)).size===specs.length&&rows.every(r=>specs.some(s=>s.id===r.id)),`Missing, duplicate or unknown ${label}`);
 }
 for(const spec of CASES){
  const row=plan.cases.find(r=>r.id===spec.id);
  need(['not-run','recorded','failed'].includes(row.outcome),'Invalid case outcome (a claimed pass is not evidence)');
  if(row.outcome!=='recorded'){issues.push(`${spec.id}: ${row.outcome}`);results.push({caseId:spec.id,result:row.outcome});continue;}
  try{
   const observation=JSON.parse(artifact(root,row.observation));
   need(observation.sourceSha===plan.source.sha&&observation.environment===environment.kind&&observation.projectRef===environment.projectRef,'Observation source/environment mismatch');
   attachments(root,row.attachments);
   results.push(assertObservation(spec,observation));
  }catch{issues.push(`${spec.id}: invalid or inconsistent evidence`);results.push({caseId:spec.id,result:'failed-evidence-check'});}
 }
 for(const spec of REVIEW_GATES){
  const row=plan.reviewGates.find(r=>r.id===spec.id);
  need(['not-run','recorded','failed'].includes(row.outcome),'Invalid manual gate outcome');
  if(row.outcome!=='recorded'){issues.push(`${spec.id}: ${row.outcome}`);continue;}
  try{micros(row.observedAt);need(typeof row.actual==='string'&&row.actual.trim().length>=20&&row.actual.length<=4000,'Missing actual outcome');attachments(root,row.attachments);}
  catch{issues.push(`${spec.id}: invalid supporting evidence`);}
 }
 return {
  schemaVersion:1,sourceSha:plan.source.sha,
  state:issues.length?'blocked':'ready-for-independent-review',
  observationChecks:results,issues,
  liveAcceptanceVerified:false,productionApproved:false,
  limitation:'Offline consistency checks only. Supplied timestamps, source/project labels, attachments and manual outcomes are untrusted operator records, not proof of execution. Review authentic deployed/session/queue evidence independently. This tool cannot approve a release or set approval variables.',
 };
}
function currentSource(root){
 return {sha:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:root,encoding:'utf8'}).trim(),files:fingerprint(root)};
}
function bundlePath(root,arg){
 need(typeof arg==='string'&&arg.length>0,'An explicit bundle directory is required');
 const dir=resolve(root,arg),rel=relative(root,dir);
 need(rel&&!rel.startsWith('..')&&!isAbsolute(rel)&&!rel.split('/').includes('.git'),'Bundle must be a non-root workspace directory outside .git');noLinks(dir);return dir;
}
export function main(args=process.argv.slice(2),root=process.cwd()){
 need(args.length===2&&['--init','--check'].includes(args[0]),'Use --init DIRECTORY or --check DIRECTORY only. No live/deploy mode exists.');
 const dir=bundlePath(root,args[1]);
 if(args[0]==='--init'){
  need(!existsSync(dir),'Refusing to overwrite an existing evidence directory');
  const plan=makePlan(currentSource(root));mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,'plan.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
  writeFileSync(join(dir,'PROCEDURE.md'),'# Unexecuted cancellation evidence plan\n\nNo requests have been sent. Every case starts not-run. Use synthetic fixtures only; never retain tokens, passwords, keys or real personal data. See documentation/JD_CANCELLATION_ACCEPTANCE.md.\n\n## Record assertions\n\n'+CASES.map(c=>`- ${c.id}: ${c.kind}, role ${c.role??'unauthenticated'}, HTTP ${c.status}.`).join('\n')+'\n\n## Independent live review gates\n\n'+REVIEW_GATES.map(g=>`- **${g.id}**: ${g.expected}`).join('\n')+'\n',{flag:'wx'});
  console.log('Prepared an UNEXECUTED offline plan. No staging or production approval granted.');return 0;
 }
 const report=evaluateBundle(dir,JSON.parse(safeRead(dir,'plan.json')),currentSource(root));
 console.log(JSON.stringify(report,null,2));return report.state==='blocked'?2:0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{process.exitCode=main();}catch{console.error('Evidence harness refused input. Check command, source identity, schema and bounded regular-file paths. No remote operation was attempted.');process.exitCode=2;}
}
