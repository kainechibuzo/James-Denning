import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {WORKSPACE_NAVIGATION,BUSINESS_GROUPS,buildWorkspaceNavigation,defaultCollapsedGroups} from "../src/config/workspace-navigation.mjs";
import {searchNavigation,isNavGroupCollapsed} from "../src/config/navigation-search.mjs";

const pageIds=nav=>nav.filter(n=>!n.group).map(n=>n.id).sort();
const build=opts=>buildWorkspaceNavigation({role:"admin",canAccess:()=>true,...opts});
function assertGroups(nav){
  assert.equal(new Set(nav.map(n=>n.id)).size,nav.length,"no duplicate pages/headers");
  for(const entry of nav){
    if(entry.group) assert.ok(nav.some(n=>n.gid===entry.id),`nonempty ${entry.id}`);
    if(entry.gid) assert.ok(nav.findIndex(n=>n.id===entry.gid)>=0&&nav.findIndex(n=>n.id===entry.gid)<nav.indexOf(entry),`parent before ${entry.id}`);
  }
}
const REMOVED=["dashboard","members","students","teachers","classes","subjects","results","report-cards","transcript","grading","fees","fee-tracker","my-bill","attendance","timetable","calendar","broadsheet","sections","approvals","access-requests","my-results"];

test("catalogue contains only JD workspace routes; legacy portal routes are gone",()=>{
  assert.deepEqual(WORKSPACE_NAVIGATION.map(n=>n.id),["jd-chat","jd-operations","billing","hiring","mail-logs","notifications","permissions","settings","admin-tools","org-create"]);
  for(const id of REMOVED)assert.ok(!WORKSPACE_NAVIGATION.some(n=>n.id===id),`${id} removed`);
  for(const n of WORKSPACE_NAVIGATION)for(const role of n.roles)assert.ok(["owner","admin","manager"].includes(role),`${n.id}:${role}`);
});
test("admin sees every route, grouped",()=>{
  const nav=build();
  assert.deepEqual(pageIds(nav),WORKSPACE_NAVIGATION.map(n=>n.id).sort());assertGroups(nav);
  assert.deepEqual(nav.slice(0,2).map(n=>n.id),["jd-chat","jd-operations"]);
  assert.ok(nav.some(n=>n.id==="billing"&&n.roles.includes("admin")&&n.roles.includes("owner")));
  const declared=BUSINESS_GROUPS.flatMap(g=>g.pages);assert.equal(new Set(declared).size,declared.length);
});
for(const role of ["owner","manager"])for(const policy of ["allow","deny","subset"])test(`${role} / ${policy} only gets permitted JD routes`,()=>{
  const canAccess=id=>policy==="allow"||(policy==="subset"&&id==="jd-chat");
  const nav=build({role,canAccess});
  const expected=policy==="allow"?(role==="owner"?["billing","jd-chat","jd-operations"]:["jd-chat","jd-operations"]):policy==="subset"?["jd-chat"]:[];
  assert.deepEqual(pageIds(nav),expected.sort());assertGroups(nav);
});
test("unsupported and legacy roles get no implicit grant, even with a permissive resolver",()=>{
  for(const role of [undefined,"employee","hr","finance","public","teacher","student","bursar"])assert.deepEqual(build({role}),[]);
});
test("every individual non-admin denial removes that route and it cannot reappear in search",()=>{
  for(const role of ["owner","manager"])for(const entry of WORKSPACE_NAVIGATION.filter(n=>n.roles.includes(role))){
    const nav=build({role,canAccess:id=>id!==entry.id});
    assert.ok(!nav.some(n=>n.id===entry.id));
    assert.ok(!searchNavigation(nav,entry.label).some(n=>n.id===entry.id));assertGroups(nav);
  }
});
test("groups start compact, active group expands, search keeps groups reachable",()=>{
  const compact=defaultCollapsedGroups("jd-chat");
  assert.equal(compact.size,BUSINESS_GROUPS.length);
  const active=defaultCollapsedGroups("hiring");
  assert.ok(!active.has("g-people"));assert.ok(active.has("g-organisation"));
  assert.equal(isNavGroupCollapsed("g-people",compact,"recruit",true),false);
  assert.equal(isNavGroupCollapsed("g-people",compact,"",false),false);
});
test("shell wires role resolver, group resets, account access and reauthentication",()=>{
  const shell=readFileSync(new URL("../src/AppDemo.jsx",import.meta.url),"utf8");
  assert.match(shell,/buildWorkspaceNavigation\(\{role,canAccess\}\)/);
  assert.match(shell,/defaultCollapsedGroups\(page\)/);
  assert.match(shell,/businessGroupForPage\(page\)/);
  assert.match(shell,/aria-label="Switch organisation" aria-haspopup="dialog"/);
  assert.match(shell,/aria-label="My profile"/);assert.match(shell,/aria-label="Sign out"/);
  assert.match(shell,/inert=\{showWorkspaceSwitch \? "" : undefined\}/);
  assert.match(shell,/signOut:options=>supabase.auth.signOut\(options\)/);
  assert.match(shell,/leave:\(\)=>window.location.assign\("\/"\)/);
  assert.match(shell,/returnFocus=\{isMobile\?navigationToggleRef.current:workspaceSwitchRef.current\}/);
  assert.match(shell,/function AccessDenied\(\)/,"denied routes render a defined component");
  for(const legacy of ["SchoolSelectPage","PlatformDashboardPage","SectionSelector","LoginPage","SCHOOL_SLUGS"])assert.doesNotMatch(shell,new RegExp(legacy));
});

test("billing is available to owners and admins only",()=>{
  assert.ok(build({role:"admin"}).some(n=>n.id==="billing"));
  assert.ok(build({role:"owner",canAccess:id=>id==="billing"}).some(n=>n.id==="billing"));
  assert.ok(!build({role:"owner",canAccess:()=>false}).some(n=>n.id==="billing"));
  assert.ok(!build({role:"manager",canAccess:()=>true}).some(n=>n.id==="billing"));
});
