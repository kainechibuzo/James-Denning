import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {LEGACY_NAVIGATION,WORKSPACE_NAVIGATION,BUSINESS_GROUPS,buildWorkspaceNavigation,defaultCollapsedGroups,usesEducationNavigation} from "../src/config/workspace-navigation.mjs";
import {searchNavigation,isNavGroupCollapsed} from "../src/config/navigation-search.mjs";
import {EDUCATION_NAV_LABELS} from "../src/config/product.js";

// Snapshot extracted from PR #87 merge 7d38797, not from the new implementation.
const baseline=JSON.parse(readFileSync(new URL("./fixtures/workspace-nav-pr87.json",import.meta.url)));
const pageIds=nav=>nav.filter(n=>!n.group).map(n=>n.id).sort();
const build=opts=>buildWorkspaceNavigation({role:"admin",workspaceType:"business",canAccess:()=>true,...opts});
function assertGroups(nav){
  assert.equal(new Set(nav.map(n=>n.id)).size,nav.length,"no duplicate pages/headers");
  for(const entry of nav){
    if(entry.group) assert.ok(nav.some(n=>n.gid===entry.id),`nonempty ${entry.id}`);
    if(entry.gid) assert.ok(nav.findIndex(n=>n.id===entry.gid)>=0&&nav.findIndex(n=>n.id===entry.gid)<nav.indexOf(entry),`parent before ${entry.id}`);
  }
}
test("route/role/icon baseline is unchanged; settings is the only added sidebar route",()=>{
  assert.deepEqual(LEGACY_NAVIGATION,baseline);
  assert.deepEqual(WORKSPACE_NAVIGATION.filter(n=>!baseline.some(b=>b.id===n.id)).map(n=>({id:n.id,roles:n.roles})),[{id:"settings",roles:["admin"]}]);
});
for(const role of ["admin","manager","bursar","teacher","student"]){
  for(const education of [false,true]){
    for(const policy of ["allow","deny","subset"]){
      test(`${role}: ${education?"education":"business"} / ${policy} preserves permitted route set`,()=>{
        const canAccess=id=>policy==="allow"||(policy==="subset"&&["jd-chat","members","fee-tracker","report-cards","my-bill"].includes(id));
        const nav=build({role,workspaceType:education?"education":"business",educationModuleEnabled:education,educationLabels:EDUCATION_NAV_LABELS,canAccess});
        const expected=baseline.filter(n=>!n.group&&n.roles.includes(role)&&(role==="admin"||canAccess(n.id))).map(n=>n.id);
        if(role==="admin"&&!education)expected.push("settings");
        assert.deepEqual(pageIds(nav),expected.sort());assertGroups(nav);
        if(education)for(const n of nav)assert.equal(n.group||n.label,EDUCATION_NAV_LABELS[n.id]||baseline.find(b=>b.id===n.id)?.group||baseline.find(b=>b.id===n.id)?.label);
      });
    }
  }
}
test("unknown/new roles get no implicit grant, even with a permissive resolver",()=>{
  for(const role of [undefined,"owner","employee","hr","finance","public"])assert.deepEqual(build({role}),[]);
});
test("every individual non-admin denial removes that route and it cannot reappear in search",()=>{
  for(const role of ["manager","bursar","teacher","student"]){
    for(const entry of baseline.filter(n=>!n.group&&n.roles.includes(role))){
      const nav=build({role,canAccess:id=>id!==entry.id});
      assert.ok(!nav.some(n=>n.id===entry.id));
      assert.ok(!searchNavigation(nav,entry.label).some(n=>n.id===entry.id));assertGroups(nav);
    }
  }
});
test("manager can see Finance and People headers without widening specialist page access",()=>{
  const nav=build({role:"manager"});
  assert.ok(nav.some(n=>n.group==="Finance"));assert.ok(nav.some(n=>n.group==="People & Recruitment"));
  assert.ok(!nav.some(n=>["teachers","students","hiring","settings","permissions"].includes(n.id)));
  assert.ok(searchNavigation(nav,"finance").some(n=>n.id==="fee-tracker"));
});
test("business destinations are unique, grouped and honest about separate record modules",()=>{
  const nav=build();
  assert.deepEqual(nav.slice(0,3).map(n=>n.id),["jd-chat","dashboard","jd-operations"]);
  assert.deepEqual(nav.filter(n=>n.gid==="g-people").map(n=>n.label),["People directory","Member records","Staff records","Recruitment"]);
  const declared=BUSINESS_GROUPS.flatMap(g=>g.pages);
  assert.equal(new Set(declared).size,declared.length);
  assert.deepEqual(pageIds(nav.filter(n=>!n.gid)),["dashboard","jd-chat","jd-operations"]);
  assert.ok(!nav.some(n=>/Commercial|Fleet|Compliance|Integrations/.test(n.group||"")),"no invented departments without pages");
});
test("business starts compact, active group expands, search/rail remain reachable",()=>{
  const compact=defaultCollapsedGroups("business",false,"jd-chat");
  assert.equal(compact.size,BUSINESS_GROUPS.length);
  const active=defaultCollapsedGroups("business",false,"fee-tracker");
  assert.ok(!active.has("g-finance"));assert.ok(active.has("g-people"));
  assert.equal(isNavGroupCollapsed("g-people",compact,"people",true),false);
  assert.equal(isNavGroupCollapsed("g-people",compact,"",false),false);
  assert.equal(defaultCollapsedGroups("education",true,"jd-chat").size,0);
});
test("education labels require explicit enabled education workspace; calls never mutate catalogue",()=>{
  assert.equal(usesEducationNavigation("education",true),true);
  for(const pair of [["education",false],["business",true],[undefined,undefined]])assert.equal(usesEducationNavigation(...pair),false);
  build({workspaceType:"education",educationModuleEnabled:true,educationLabels:EDUCATION_NAV_LABELS});build();
  assert.deepEqual(LEGACY_NAVIGATION,baseline);
});
test("shell wires role resolver, department resets, account access and reauthentication",()=>{
  const shell=readFileSync(new URL("../src/AppDemo.jsx",import.meta.url),"utf8");
  assert.match(shell,/buildWorkspaceNavigation\(\{role,canAccess,workspaceType,educationModuleEnabled/);
  assert.match(shell,/defaultCollapsedGroups\(workspaceType,educationModuleEnabled,page\)/);
  assert.match(shell,/businessGroupForPage\(page\)/);
  assert.match(shell,/aria-label="Switch organisation" aria-haspopup="dialog"/);
  assert.match(shell,/aria-label="My profile"/);assert.match(shell,/aria-label="Sign out"/);
  assert.match(shell,/inert=\{showWorkspaceSwitch \? "" : undefined\}/);
  assert.match(shell,/signOut:options=>supabase.auth.signOut\(options\)/);
  assert.match(shell,/leave:\(\)=>window.location.assign\("\/"\)/);
  assert.match(shell,/returnFocus=\{isMobile\?navigationToggleRef.current:workspaceSwitchRef.current\}/);
});
