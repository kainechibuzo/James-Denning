// Workspace route and role catalogue.
// Navigation is not an authority boundary: backend policies and the canAccess
// resolver decide access. Layout changes must not silently widen route access.
// Owner grants are explicit JD-only grants, not aliases for admin.
export const canOpenOperations = role => ["owner","admin","manager"].includes(role);
export const canAdministerOperations = role => ["owner","admin"].includes(role);

const entries = [
  {id:"jd-chat",       label:"JD Assistant",          icon:"dashboard",  roles:["owner","admin","manager"]},
  {id:"jd-operations", label:"Tasks & Operations",    icon:"activity",   roles:["owner","admin","manager"]},
  {id:"billing",       label:"Billing",               icon:"wallet",     roles:["owner","admin"]},
  {id:"hiring",        label:"Recruitment",           icon:"user-check", roles:["admin"]},
  {id:"mail-logs",     label:"Email Logs",            icon:"mail-logs",  roles:["admin"]},
  {id:"notifications", label:"Notifications",         icon:"bell",       roles:["admin"]},
  {id:"permissions",   label:"Permissions",           icon:"shield",     roles:["admin"]},
  {id:"settings",      label:"Organisation Settings", icon:"settings",   roles:["admin"]},
  {id:"admin-tools",   label:"Admin Tools",           icon:"database",   roles:["admin"]},
  {id:"org-create",    label:"Register organisation", icon:"building",   roles:["admin"]},
];

export const WORKSPACE_NAVIGATION = Object.freeze(entries.map((entry) => Object.freeze({
  ...entry, roles: Object.freeze([...entry.roles]),
})));

export const BUSINESS_GROUPS = Object.freeze([
  {id:"g-people",group:"People & Recruitment",pages:["hiring"]},
  {id:"g-communications",group:"Communications",pages:["mail-logs","notifications"]},
  {id:"g-organisation",group:"Organisation",pages:["billing","permissions","settings","admin-tools","org-create"]},
].map((group) => Object.freeze({...group,pages:Object.freeze(group.pages)})));

export function businessGroupForPage(page) {
  return BUSINESS_GROUPS.find((group) => group.pages.includes(page))?.id;
}

export function defaultCollapsedGroups(page) {
  const active = businessGroupForPage(page);
  return new Set(BUSINESS_GROUPS.filter((group) => group.id !== active).map((group) => group.id));
}

// Derive groups from permitted children: never leave an orphan or empty header.
export function buildWorkspaceNavigation({role, canAccess = () => false}) {
  const permitted = new Map();
  for (const entry of WORKSPACE_NAVIGATION) {
    if (!entry.roles.includes(role) || permitted.has(entry.id)) continue;
    if (role !== "admin" && !canAccess(entry.id)) continue; // Preserve existing admin semantics.
    permitted.set(entry.id, {...entry});
  }
  const output = [];
  const take = (id, gid) => {
    if (!permitted.has(id)) return;
    const page = {...permitted.get(id)};
    if (gid) page.gid = gid; else delete page.gid;
    output.push(page); permitted.delete(id);
  };
  for (const id of ["jd-chat","jd-operations"]) take(id);
  for (const group of BUSINESS_GROUPS) {
    const children = group.pages.filter((id) => permitted.has(id));
    if (!children.length) continue;
    output.push({id:group.id,group:group.group});
    for (const id of children) take(id,group.id);
  }
  // Future authorised routes must not disappear merely because layout metadata is missing.
  for (const id of [...permitted.keys()]) take(id);
  return output;
}
