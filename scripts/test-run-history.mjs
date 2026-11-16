import test from 'node:test';
import assert from 'node:assert/strict';
import {friendlyTool,friendlyStatus,readRunHistory} from '../src/chat/run-history.mjs';
const id='00000000-0000-4000-8000-000000000001';
const run=()=>({id,status:'queued',request_preview:'Synthetic request',steps:[]});
const client=result=>({functions:{invoke:async(name,{body})=>{assert.equal(name,'jd-automation');assert.deepEqual(body,{action:'runs.list'});return result;}}});
test('tool labels never invent completion, including unknown/prototype property names',()=>{
 for(const key of ['unknown','constructor','__proto__','create_operational_setup_tasks','get_workspace_overview'])assert.doesNotMatch(friendlyTool(key),/completed|reviewed|saved/i);
 assert.match(friendlyTool('unknown'),/unavailable/);
});
test('pending, skipped, partial and unknown states are not successful completion',()=>{
 assert.equal(friendlyStatus('pending'),'Pending');assert.equal(friendlyStatus('skipped'),'Skipped');assert.equal(friendlyStatus('partially_completed'),'Partially completed');assert.equal(friendlyStatus('completed'),'Completed record');assert.equal(friendlyStatus('constructor'),'Unrecognised status');assert.equal(friendlyStatus('unknown'),'Unrecognised status');
});
test('valid persisted history and genuine empty history are distinguishable from failure',async()=>{
 for(const runs of [[],[run()]])assert.deepEqual(await readRunHistory(client({data:{runs}})),runs);
});
for(const [label,response] of [['missing response',undefined],['missing rows',{data:{}}],['API body error',{data:{error:'PRIVATE_TOKEN'}}],['invalid row',{data:{runs:[{}]}}],['duplicate rows',{data:{runs:[run(),run()]}}],['missing steps',{data:{runs:[{...run(),steps:undefined}]}}],['bad step',{data:{runs:[{...run(),steps:[{id:'fake'}]}]}}]])test(`run history rejects ${label} without private diagnostics`,async()=>{
 await assert.rejects(readRunHistory(client(response)),error=>{assert.doesNotMatch(error.message,/PRIVATE_TOKEN/);return true;});
});
for(const status of [401,403,500])test(`run history handles HTTP ${status} without raw error text`,async()=>{
 await assert.rejects(readRunHistory(client({error:{context:{status},message:'PRIVATE_TOKEN'}})),error=>{assert.doesNotMatch(error.message,/PRIVATE_TOKEN/);return true;});
});
test('transport rejection is sanitised and never retried',async()=>{
 let calls=0;await assert.rejects(readRunHistory({functions:{invoke:async()=>{calls++;throw Error('PRIVATE_TOKEN');}}}),/Check your connection/);assert.equal(calls,1);
});
for(const patch of [{model:{}},{model_requests:'bad'},{model_requests:[null]},{token_usage:[]}])test(`optional run metrics cannot crash the UI: ${JSON.stringify(patch)}`,async()=>{
 await assert.rejects(readRunHistory(client({data:{runs:[{...run(),...patch}]}})),/incomplete records/);
});
