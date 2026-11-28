import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {workspaceIdentity} from '../src/auth/workspace-identity.mjs';
import {buildWorkspaceNavigation,canOpenOperations,canAdministerOperations} from '../src/config/workspace-navigation.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const input=(role='owner')=>({user:{id:id(1),email:'synthetic@example.invalid'},profile:{id:id(1),school_id:id(2),role,full_name:'Synthetic owner'},school:{id:id(2)}});
for(const role of ['owner','admin','manager','staff','finance','hr','contractor','viewer'])test(`identity preserves ${role} without aliasing to admin`,()=>{
 const user=workspaceIdentity(input(role));assert.equal(user.role,role);assert.equal(user.id,user._authUserId);assert.equal(user.school_id,id(2));
});
for(const role of [undefined,null,'','superadmin','OWNER',' admin ','teacher','student','bursar'])test(`missing/unsupported role ${String(role)} cannot become admin`,()=>{
 const value=input();value.profile.role=role;assert.throws(()=>workspaceIdentity(value),/role is missing or unsupported/);
});
test('profile, authenticated actor and workspace identities must agree before persistence',()=>{
 for(const mutate of [v=>v.user=null,v=>v.profile=null,v=>v.school=null,v=>v.profile.id=id(3),v=>v.profile.school_id=id(3),v=>v.user.id='bad',v=>v.school.id='bad']){const v=input();mutate(v);assert.throws(()=>workspaceIdentity(v),/workspace association/);}
 const source=readFileSync('src/App.jsx','utf8');assert.ok(source.indexOf('const user=workspaceIdentity(')<source.indexOf('db.setSchool(school.id'));assert.doesNotMatch(source,/profile\.role\|\|"admin"/);
 assert.doesNotMatch(source,/from\("(teachers|students|student_profiles)"\)/);
});
test('owner gets JD Assistant, Billing and Settings only when explicitly permitted',()=>{
 const build=canAccess=>buildWorkspaceNavigation({role:'owner',canAccess});
 assert.deepEqual(build(()=>true).map(n=>n.id),['jd-chat','g-organisation','billing','settings']);
 assert.deepEqual(build(page=>page==='jd-chat').map(n=>n.id),['jd-chat']);
 assert.deepEqual(build(()=>false),[]);
});
test('manager keeps the chat-first navigation and does not inherit account controls',()=>{
 assert.deepEqual(buildWorkspaceNavigation({role:'manager',canAccess:()=>true}).map(n=>n.id),['jd-chat']);
});
test('admin sees the account destinations in the Organisation group',()=>{
 assert.deepEqual(buildWorkspaceNavigation({role:'admin',canAccess:()=>true}).map(n=>n.id),['jd-chat','g-organisation','admin-dashboard','billing','settings']);
});
test('owner access is additive and scoped, not blanket legacy admin access',()=>{
 for(const role of ['owner','admin','manager'])assert.equal(canOpenOperations(role),true);
 for(const role of ['staff','viewer','finance','hr','contractor','teacher','student',undefined])assert.equal(canOpenOperations(role),false);
 for(const role of ['owner','admin'])assert.equal(canAdministerOperations(role),true);assert.equal(canAdministerOperations('manager'),false);
 const shell=readFileSync('src/AppDemo.jsx','utf8');assert.match(shell,/canOpenOperations\(role\)&&canAccess\("jd-operations"\)/);
 assert.match(shell,/role!=="owner"\|\|canAccess\("jd-chat"\)/);
 assert.doesNotMatch(shell,/user.role==="owner"\) return true/);
});

test('owner permission reads use the authenticated profile ID, not an undefined staff/student ID',async()=>{
 const {readOwnerNavigationPermissions,ownerNavigationScope}=await import('../src/auth/owner-navigation-permissions.mjs');const calls=[];const user=workspaceIdentity(input());
 const result=await readOwnerNavigationPermissions({getRolePermissions:async role=>(calls.push(['role',role]),{data:[]}),getUserPermissions:async actor=>(calls.push(['actor',actor]),{data:[{page_id:'page:jd-operations',allowed:false,user_id:id(1)}]})},user);
 assert.deepEqual(calls,[['role','owner'],['actor',id(1)]]);assert.equal(result.scope,ownerNavigationScope(user));assert.equal(result.userPermissions[0].allowed,false);
 assert.notEqual(ownerNavigationScope({...user,school_id:id(9)}),result.scope);
});
test('owner permission load errors or malformed overrides never become an empty permissive result',async()=>{
 const {readOwnerNavigationPermissions}=await import('../src/auth/owner-navigation-permissions.mjs');
 for(const result of [{error:{message:'PRIVATE_TOKEN'}},{data:null},{data:[{page_id:'jd-operations',allowed:'false'}]}])await assert.rejects(readOwnerNavigationPermissions({getRolePermissions:async()=>({data:[]}),getUserPermissions:async()=>result},workspaceIdentity(input())),e=>{assert.doesNotMatch(e.message,/PRIVATE_TOKEN/);return true;});
 const shell=readFileSync('src/AppDemo.jsx','utf8');assert.match(shell,/ownerPermissions.scope!==ownerNavigationScope\(user\)\|\|ownerPermissions.status!=="ready"/);assert.match(shell,/return\(\)=>\{current=false;\};/);
});

test('owner override metadata must match the requested tenant, role and actor',async()=>{
 const {readOwnerNavigationPermissions}=await import('../src/auth/owner-navigation-permissions.mjs');
 for(const [roles,users] of [[[{page_id:'jd-operations',allowed:true,school_id:id(9),role:'owner'}],[]],[[],[{page_id:'jd-operations',allowed:true,user_id:id(9)}]]])await assert.rejects(readOwnerNavigationPermissions({getRolePermissions:async()=>({data:roles}),getUserPermissions:async()=>({data:users})},workspaceIdentity(input())),/scope/);
});
