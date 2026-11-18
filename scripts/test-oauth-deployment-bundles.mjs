import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const manifest=JSON.parse(readFileSync('deployment/oauth-testdb/manifest.json','utf8'));
const digest=x=>createHash('sha256').update(x).digest('hex');
for(const [name,meta] of Object.entries(manifest.functions)){
 test(`${name}: immutable artifact and source integrity`,()=>{
  const code=readFileSync(`deployment/oauth-testdb/${name}.mjs`,'utf8');
  assert.equal(digest(code),meta.bundleSha256);
  for(const s of meta.sources)assert.equal(digest(execFileSync('git',['show',`${manifest.sourceSha}:${s.path}`])),s.sha256);
  assert.ok(meta.externalImports.every(i=>/^(npm:|https:)/.test(i.path)));
 });
 test(`${name}: bundled handler denies unauthenticated requests without network or data access`,async()=>{
  let handler;const calls=[];
  const db={auth:{getUser:async()=>({data:{user:null},error:{message:'synthetic invalid session'}})},from(){calls.push('db');throw Error('Unexpected database access');},rpc(){calls.push('rpc');throw Error('Unexpected RPC');}};
  const mocks={createClient:()=>db,withOAuthProtectedResource:()=>({}),withSupabase:()=>({}),pipeline:(_middlewares,fn)=>req=>fn(req,{supabase:db}),McpServer:class{},createMcpHandler:()=>{throw Error('Unexpected MCP execution');}};
  let z;z=new Proxy(()=>z,{get:()=>z,apply:()=>z});mocks.z=z;
  const code=readFileSync(`deployment/oauth-testdb/${name}.mjs`,'utf8').replace(/^import\s*\{([^}]+)\}\s*from\s*"(?:npm:|https:)[^"]+";/gm,(_m,imports)=>`const {${imports.replace(/\s+as\s+/g,':')}} = mocks;`);
  assert.doesNotMatch(code,/^import /m);
  const env={SUPABASE_URL:'https://synthetic.example.test',SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'};
  new Function('mocks','Deno','fetch',code)(mocks,{env:{get:k=>env[k]},serve:fn=>{handler=fn;}},()=>{calls.push('network');throw Error('Unexpected network');});
  assert.equal(typeof handler,'function');
  const callback=name==='jd-business-oauth-callback';
  const response=await handler(new Request('https://synthetic.example.test',{method:callback?'GET':'POST',...(callback?{}:{body:'{}'})}));
  assert.equal(response.status,callback?400:401);assert.deepEqual(calls,[]);
  if(name==='jd-connect-oauth'){
   const response=await handler(new Request('https://synthetic.example.test',{method:'OPTIONS',headers:{Origin:'https://james-denning.com.ng'}}));
   assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
  }
 });
}
