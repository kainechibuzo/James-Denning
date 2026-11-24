// Provider request guard: malformed tool-call items in the replayed
// conversation must never reach the model provider. A function_call with
// unparseable arguments used to survive checkpoints and fail every later
// request (the chat-completions adapter throws on it; the Responses API
// rejects it) — the production "model provider rejected JD's request"
// instant-failure class. The helper is pure; the call-site guard below keeps
// the runtime transport wired to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sanitiseModelConversationInput} from '../supabase/functions/_shared/jd-agent-stream.ts';

test('non-array input becomes an empty conversation',()=>{
 assert.deepEqual(sanitiseModelConversationInput(undefined),[]);
 assert.deepEqual(sanitiseModelConversationInput({role:'user'}),[]);
});

test('non-object items are dropped',()=>{
 assert.deepEqual(sanitiseModelConversationInput(['text',42,null]),[]);
});

test('valid function_call items pass through unchanged',()=>{
 const item={type:'function_call',call_id:'call_1',name:'lookup',arguments:'{"q":"Q3"}'};
 const out=sanitiseModelConversationInput([{role:'user',content:'hi'},item,{type:'function_call_output',call_id:'call_1',output:'{"ok":true}'}]);
 assert.equal(out.length,3);
 assert.equal(out[1],item,'usable items keep their identity');
 assert.equal(out[2].output,'{"ok":true}');
});

test('malformed arguments are replaced with an empty object, keeping call id and name',()=>{
 const out=sanitiseModelConversationInput([{type:'function_call',call_id:'call_9',name:'search_repositories',arguments:'{"q": truncated'}]);
 assert.equal(out.length,1);
 assert.equal(out[0].call_id,'call_9');
 assert.equal(out[0].name,'search_repositories');
 assert.equal(out[0].arguments,'{}');
});

test('non-object and unparseable argument shapes are neutralised',()=>{
 for(const args of ['null','[1,2]','not json at all','{"a":1}{']){
  const out=sanitiseModelConversationInput([{type:'function_call',call_id:'c',name:'n',arguments:args}]);
  assert.equal(out[0].arguments,'{}',args);
 }
 assert.equal(sanitiseModelConversationInput([{type:'function_call',call_id:'c',name:'n',arguments:'{"ok":true}'}])[0].arguments,'{"ok":true}');
});

test('items without a correlated call id or function name are dropped with their outputs',()=>{
 const out=sanitiseModelConversationInput([
  {type:'function_call',call_id:'orphan',name:'',arguments:'{}'},
  {type:'function_call_output',call_id:'orphan',output:'{}'},
  {type:'function_call',id:'id_only',name:'named',arguments:'{}'},
  {type:'function_call_output',call_id:'id_only',output:'{}'},
 ]);
 assert.deepEqual(out.map(item=>item.type),['function_call','function_call_output'],'nameless calls and their outputs vanish; id-carrying calls stay');
 assert.equal(out[0].call_id||out[0].id,'id_only');
});

test('outputs without a call id are dropped',()=>{
 const out=sanitiseModelConversationInput([
  {type:'function_call',call_id:'c1',name:'n',arguments:'{}'},
  {type:'function_call_output',output:'{}'},
 ]);
 assert.equal(out.length,1);
});

test('the runtime transport sanitises every model request at the boundary',()=>{
 const runtime=readFileSync('supabase/functions/_shared/jd-agent-runtime.ts','utf8');
 assert.match(runtime,/import \{[^}]*sanitiseModelConversationInput[^}]*\} from "\.\/jd-agent-stream\.ts"/);
 assert.match(runtime,/input = \{ \.\.\.input, input: sanitiseModelConversationInput\(input\.input\) \};/);
 const callModelBody=runtime.slice(runtime.indexOf('async function callModel'));
 assert.ok(callModelBody.includes('sanitiseModelConversationInput')&&callModelBody.indexOf('sanitiseModelConversationInput')<callModelBody.indexOf('await fetch'),'sanitisation happens before the provider fetch');
});
