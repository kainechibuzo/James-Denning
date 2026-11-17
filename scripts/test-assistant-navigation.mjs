import test from 'node:test';
import assert from 'node:assert/strict';
import {assistantNavigation,JD_ASSISTANT_TOOLS} from '../src/config/assistant-navigation.mjs';
import {buildWorkspaceNavigation} from '../src/config/workspace-navigation.mjs';
for(const role of ['admin','manager','owner','viewer','contractor',undefined])for(const allowed of [true,false]){
 test(`assistant tools respect the existing authorised chat route: ${role}/${allowed}`,()=>{
  const nav=buildWorkspaceNavigation({role,canAccess:()=>allowed});
  assert.deepEqual(assistantNavigation(nav),nav.some(n=>n.id==='jd-chat')?JD_ASSISTANT_TOOLS:[]);
 });
}
test('assistant search is case insensitive, multi-term and cannot manufacture a grant',()=>{
 const nav=buildWorkspaceNavigation({role:'admin'});
 assert.deepEqual(assistantNavigation(nav,'AI usage').map(n=>n.id),['usage']);
 assert.deepEqual(assistantNavigation(nav,'CONVERSATION HISTORY').map(n=>n.id),['history']);
 assert.deepEqual(assistantNavigation(nav,'unknown'),[]);
 assert.deepEqual(assistantNavigation([],'AI usage'),[]);
});
