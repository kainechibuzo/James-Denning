// Narrow direct-test-DB release authorized by the owner in this Arena session.
// Offline only: emits immutable ESM bundles for the connector's single-body
// deployment API. No SQL, credentials, network calls or deployment occur here.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const {build,version}=await import(pathToFileURL(resolve(process.env.JD_DEPLOY_ESBUILD_MODULE||'.cache/deploy-tools/node_modules/esbuild/lib/main.js')).href);
if(version!=='0.25.12')throw Error('Use the reviewed esbuild 0.25.12 packaging tool.');
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const functions={'jd-connect-oauth':false,'jd-connect':false,'jd-business-platform':true,'jd-business-oauth-callback':false,'jd-automation':true,'jd-execution-worker':false,'jd-mcp':false};
const root=process.cwd(),out=resolve('deployment/oauth-testdb'),manifest={sourceSha,projectRef:'thklwiybjuhrjqrrxyid',authorization:'Owner confirmed this exact existing project is the test DB and instructed direct deployment without separate staging.',compiler:`esbuild@${version}`,dependencyBoundary:'Local modules bundled; original npm/HTTPS imports remain external. Their remote dependency resolution is not fully locked by this manifest.',functions:{}};
const sha=x=>createHash('sha256').update(x).digest('hex');
mkdirSync(out,{recursive:true});
for(const [name,verifyJwt] of Object.entries(functions)){
 const entry=`supabase/functions/${name}/index.ts`;
 const config=readFileSync('supabase/config.toml','utf8').split(`[functions.${name}]`)[1]?.split(/\n\s*\[/)[0];
 if(!config||!new RegExp(`^verify_jwt = ${verifyJwt}$`,'m').test(config))throw Error('Unexpected JWT setting for '+name);
 const result=await build({entryPoints:[entry],bundle:true,format:'esm',platform:'neutral',target:'es2022',write:false,metafile:true,minify:false,legalComments:'inline',external:['npm:*','https:*'],plugins:[{name:'worker-shared-layout',setup(b){b.onResolve({filter:/^\.\/_shared\//},args=>{
  if(args.importer===resolve('supabase/functions/jd-execution-worker/index.ts'))return{path:resolve('supabase/functions/_shared',args.path.slice('./_shared/'.length))};
 });}}]});
 const code=result.outputFiles[0].text;
 const imports=Object.values(result.metafile.outputs).flatMap(o=>o.imports);
 if(imports.some(i=>!i.external||! /^(npm:|https:)/.test(i.path)))throw Error('Unbundled local dependency');
 const sources=Object.keys(result.metafile.inputs).sort().map(p=>({path:p,sha256:sha(readFileSync(resolve(root,p)))}));
 // All shipped source must match the reviewed checkout; never accidentally ship
 // an uncommitted application edit or secret from a generated local directory.
 for(const source of sources){const committed=execFileSync('git',['show',`${sourceSha}:${source.path}`]);if(sha(committed)!==source.sha256)throw Error('Source differs from commit: '+source.path);}
 writeFileSync(resolve(out,`${name}.mjs`),code);
 manifest.functions[name]={entry,verifyJwt,bundleSha256:sha(code),bytes:Buffer.byteLength(code),sources,externalImports:imports.map(i=>({path:i.path,kind:i.kind}))};
}
writeFileSync(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({sourceSha,functions:Object.keys(functions),bytes:Object.values(manifest.functions).reduce((sum,f)=>sum+f.bytes,0)}));
