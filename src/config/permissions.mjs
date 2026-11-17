// Role permission catalogue for the workspace Permissions page.
// Permission ids use the "page:<route>" and "action:<name>" forms stored in
// role_permissions.page_id. Admin always has full access; owner grants are read
// explicitly (see auth/owner-navigation-permissions.mjs).
export const PERM_GROUPS = Object.freeze([
  {id:"workspace",label:"Workspace",color:"#111827",perms:[
    {id:"page:jd-chat",        label:"JD Assistant",       desc:"Chat with the JD assistant and AI workforce"},
    {id:"page:jd-operations",  label:"Tasks & Operations", desc:"Open the operations workspace, task queue and runs"},
  ]},
  {id:"people",label:"People & Recruitment",color:"#1A8C3C",perms:[
    {id:"page:hiring",         label:"Recruitment",        desc:"Manage job posts and applicants"},
  ]},
  {id:"communication",label:"Communication",color:"#0891B2",perms:[
    {id:"page:mail-logs",      label:"Email Logs",         desc:"View sent email history"},
    {id:"page:notifications",  label:"Notifications",      desc:"Configure workspace notifications"},
  ]},
  {id:"system",label:"System",color:"#64748B",perms:[
    {id:"page:audit-log",           label:"Audit Trail",        desc:"View the workspace activity log"},
    {id:"action:configure_settings",label:"Configure Settings", desc:"Change organisation-wide settings"},
    {id:"action:manage_permissions",label:"Manage Permissions", desc:"Change role permissions"},
  ]},
].map(group=>Object.freeze({...group,perms:Object.freeze(group.perms.map(p=>Object.freeze({...p})))})));

export const PERM_ROLE_DEFAULTS = Object.freeze({
  owner:   Object.freeze([]),
  manager: Object.freeze(["page:jd-chat","page:jd-operations"]),
});

export const RBAC_ROLES = Object.freeze([
  Object.freeze({id:"owner",   label:"Owner",   color:"#111827", desc:"Business owner: JD routes are granted explicitly per workspace"}),
  Object.freeze({id:"manager", label:"Manager", color:"#7C3AED", desc:"Runs day-to-day operations with the JD assistant and task queue"}),
]);
