import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {WORKSPACE_NAVIGATION,buildWorkspaceNavigation} from "../src/config/workspace-navigation.mjs";
import {JD_ASSISTANT_TOOLS,assistantNavigation} from "../src/config/assistant-navigation.mjs";

const build=opts=>buildWorkspaceNavigation({role:"admin",canAccess:()=>true,...opts});

test("workspace route catalogue retains implemented business destinations and role declarations",()=>{
  assert.deepEqual(WORKSPACE_NAVIGATION.map(n=>n.id),["admin-dashboard","jd-chat","jd-operations","jd-skills","billing","hiring","mail-logs","notifications","permissions","settings","admin-tools","org-create"]);
  for(const entry of WORKSPACE_NAVIGATION)assert.ok(Array.isArray(entry.roles)&&entry.roles.length>0);
});

test("workspace shell exposes JD Assistant and permission-scoped owner/admin account destinations",()=>{
  assert.deepEqual(build({role:"owner",canAccess:()=>true}).map(n=>n.id),["jd-chat","g-organisation","billing","settings"]);
  assert.deepEqual(build({role:"admin",canAccess:()=>true}).map(n=>n.id),["jd-chat","g-organisation","admin-dashboard","billing","settings"]);
  assert.deepEqual(build({role:"manager",canAccess:()=>true}).map(n=>n.id),["jd-chat"]);
  assert.deepEqual(build({role:"owner",canAccess:()=>false}),[]);
  assert.deepEqual(build({role:"owner",canAccess:page=>page==="jd-chat"}).map(n=>n.id),["jd-chat"]);
  assert.deepEqual(build({role:"manager",canAccess:()=>false}),[]);
  assert.deepEqual(build({role:"admin",canAccess:()=>false}).map(n=>n.id),["jd-chat"]);
  for(const role of [undefined,"viewer","employee","hr","finance","public","teacher","student"])assert.deepEqual(build({role,canAccess:()=>true}),[]);
});

test("assistant menu contains the operational destinations and is gated by authorised JD chat",()=>{
  assert.deepEqual(JD_ASSISTANT_TOOLS.map(n=>n.id),["new","history","review","departments","usage","runs","workforce","connectors"]);
  const authorised=[{id:"jd-chat",group:undefined}];
  assert.deepEqual(assistantNavigation(authorised).map(n=>n.id),JD_ASSISTANT_TOOLS.map(n=>n.id));
  assert.deepEqual(assistantNavigation([{id:"jd-chat",group:"business"}]),[]);
  assert.deepEqual(assistantNavigation(authorised,"workforce").map(n=>n.id),["workforce"]);
});

test("shell wires role resolver, account access and reauthentication",()=>{
  const shell=readFileSync(new URL("../src/AppDemo.jsx",import.meta.url),"utf8");
  assert.match(shell,/buildWorkspaceNavigation\(\{role,canAccess\}\)/);
  // Initial page comes from the URL resolver (payment returns, ?page= links, /admin).
  assert.match(shell,/useState\(\(\)=>pageFromLocation\(window\.location\)\)/);
  assert.match(shell,/from "\.\/config\/workspace-routes\.mjs"/);
  assert.match(shell,/page===\"admin-dashboard\" && \(role===\"admin\" \? <AdminDashboardPage ctx=\{ctx\}\/> : <AccessDenied\/>\)/);
  assert.match(shell,/aria-label="Switch organisation" aria-haspopup="dialog"/);
  assert.match(shell,/aria-label="My profile"/);assert.match(shell,/aria-label="Sign out"/);
  assert.match(shell,/signOut:options=>supabase\.auth\.signOut\(options\)/);
  assert.match(shell,/function AccessDenied\(\)/);
  for(const legacy of ["SchoolSelectPage","PlatformDashboardPage","SectionSelector","LoginPage","SCHOOL_SLUGS"])assert.doesNotMatch(shell,new RegExp(legacy));
});
