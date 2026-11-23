import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {WORKSPACE_NAVIGATION,buildWorkspaceNavigation} from "../src/config/workspace-navigation.mjs";
import {JD_ASSISTANT_TOOLS,assistantNavigation} from "../src/config/assistant-navigation.mjs";

const build=opts=>buildWorkspaceNavigation({role:"admin",canAccess:()=>true,...opts});

test("workspace route catalogue retains implemented business destinations and role declarations",()=>{
  assert.deepEqual(WORKSPACE_NAVIGATION.map(n=>n.id),["jd-chat","jd-operations","jd-skills","billing","hiring","mail-logs","notifications","permissions","settings","admin-tools","org-create"]);
  for(const entry of WORKSPACE_NAVIGATION)assert.ok(Array.isArray(entry.roles)&&entry.roles.length>0);
});

test("single-entry workspace shell exposes JD Assistant without widening role access",()=>{
  for(const role of ["owner","admin","manager"])assert.deepEqual(build({role,canAccess:()=>true}).map(n=>n.id),["jd-chat"]);
  assert.deepEqual(build({role:"owner",canAccess:()=>false}),[]);
  assert.deepEqual(build({role:"manager",canAccess:()=>false}),[]);
  // Admin's explicit role grant is sufficient; owner/manager still require
  // the resolved JD-chat permission from the workspace policy layer.
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
  assert.match(shell,/aria-label="Switch organisation" aria-haspopup="dialog"/);
  assert.match(shell,/aria-label="My profile"/);assert.match(shell,/aria-label="Sign out"/);
  assert.match(shell,/signOut:options=>supabase\.auth\.signOut\(options\)/);
  assert.match(shell,/function AccessDenied\(\)/);
  for(const legacy of ["SchoolSelectPage","PlatformDashboardPage","SectionSelector","LoginPage","SCHOOL_SLUGS"])assert.doesNotMatch(shell,new RegExp(legacy));
});
