// Actual agent runtime, synthetic streamed provider and scoped read stubs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {runAgent} from '../supabase/functions/_shared/jd-agent-runtime.ts';
const response=output=>new Response('data: '+JSON.stringify({type:'response.completed',response:{id:'synthetic',status:'completed',output}})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
const message=[{type:'message',role:'assistant',content:[{type:'output_text',text:'Synthetic answer'}]}];
async function fixture(run,{tool=false}={}){
 const oldFetch=globalThis.fetch,oldDeno=globalThis.Deno,phases=[],operations=[];let phase=null,round=0;
 globalThis.Deno={env:{get:()=>undefined}};
 globalThis.fetch=async()=>{operations.push(['provider',phase]);round++;return response(tool&&round===1?[{type:'function_call',name:'get_operations_intelligence',call_id:'fixture',arguments:'{}'}]:message);};
 const query={select(){return query;},eq(){return query;},order(){return query;},async limit(){operations.push(['database',phase]);return{data:[]};}};
 const input={message:'Synthetic bounded work',history:[],apiKey:'synthetic',model:'synthetic',context:{userId:'actor',schoolId:'tenant',role:'owner',admin:{from(){return query;}}},onUsagePhase:async value=>{phase=value;phases.push(value);},onCheckpoint:async()=>operations.push(['checkpoint',phase]),onToolEvent:async()=>operations.push(['tool-event',phase])};
 try{return await run({input,phases,operations});}finally{globalThis.fetch=oldFetch;globalThis.Deno=oldDeno;}
}
test('provider and memory waits are excluded while runtime processing is active',()=>fixture(async({input,phases,operations})=>{const r=await runAgent(input);assert.equal(r.status,'completed');assert.deepEqual(phases,['external_wait','active','external_wait','active']);assert.ok(operations.every(([,phase])=>phase==='external_wait'));}));
test('entire parallel tool round and persistence are excluded without phase races',()=>fixture(async({input,phases,operations})=>{await runAgent(input);assert.ok(operations.some(([op])=>op==='tool-event'));assert.ok(operations.some(([op])=>op==='checkpoint'));assert.ok(operations.every(([,phase])=>phase==='external_wait'));for(let i=1;i<phases.length;i++)assert.notEqual(phases[i],phases[i-1]);},{tool:true}));
test('meter rejection stops before first provider request',()=>fixture(async({input,operations})=>{input.onUsagePhase=async()=>{throw Error('lease denied');};await assert.rejects(runAgent(input),/lease denied/);assert.equal(operations.length,0);}));
test('meter rejection is not swallowed by best-effort memory loading',()=>fixture(async({input,operations})=>{let n=0;input.onUsagePhase=async()=>{if(++n===2)throw Error('budget denied');};await assert.rejects(runAgent(input),/budget denied/);assert.equal(operations.some(([op])=>op==='provider'),false);}));
test('meter rejection before tool round prevents tool execution',()=>fixture(async({input,operations})=>{const record=input.onUsagePhase;let n=0;input.onUsagePhase=async phase=>{if(++n===5)throw Error('usage uncertain');await record(phase);};await assert.rejects(runAgent(input),/usage uncertain/);assert.equal(operations.some(([op])=>op==='tool-event'),false);},{tool:true}));
test('legacy runtime remains functional without accounting hook',()=>fixture(async({input,phases})=>{delete input.onUsagePhase;assert.equal((await runAgent(input)).status,'completed');assert.deepEqual(phases,[]);}));

test('actual execution-worker entrypoint parses and wires default-off usage into runtime',async()=>{
 const {readFileSync}=await import('node:fs');const {transformWithOxc}=await import('vite');
 const source=readFileSync('supabase/functions/jd-execution-worker/index.ts','utf8');
 const {code}=await transformWithOxc(source,'worker.ts');
 assert.match(code,/runWithShadowUsage\(/);assert.match(code,/JD_USAGE_SHADOW_ENABLED/);assert.match(code,/onUsagePhase/);
 assert.match(source,/enabled: Deno\.env\.get\("JD_USAGE_SHADOW_ENABLED"\) === "true"/);
});
