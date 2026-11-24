// Workspace route and role catalogue.
// Navigation is not an authority boundary: backend policies and the canAccess
// resolver decide access. Layout changes must not silently widen route access.
// Owner grants are explicit JD-only grants, not aliases for admin.
export const canOpenOperations = role => ["owner","admin","manager"].includes(role);
export const canAdministerOperations = role => ["owner","admin"].includes(role);

const entries = [
  {id:"jd-chat",       label:"JD Assistant",          icon:"dashboard",  roles:["owner","admin","manager"]},
  {id:"jd-operations", label:"Tasks & Operations",    icon:"activity",   roles:["owner","admin","manager"]},
  {id:"jd-skills",     label:"Skills Catalog",        icon:"package",    roles:["admin"]},
  {id:"billing",       label:"Billing",               icon:"wallet",     roles:["owner","admin"]},
  {id:"hiring",        label:"Recruitment",           icon:"user-check", roles:["admin"]},
  {id:"mail-logs",     label:"Email Logs",            icon:"mail-logs",  roles:["admin"]},
  {id:"notifications", label:"Notifications",         icon:"bell",       roles:["admin"]},
  {id:"permissions",   label:"Permissions",           icon:"shield",     roles:["admin"]},
  {id:"settings",      label:"Settings",               icon:"settings",   roles:["owner","admin"]},
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
  // Keep JD Assistant as the primary destination, with the two account-level
  // destinations owners/admins need to manage their workspace and subscription.
  // This is presentation only: every destination still passes the permission
  // resolver here and the route/backend must enforce access independently.
  const chat = WORKSPACE_NAVIGATION.find((entry) => entry.id === "jd-chat");
  if (!chat || !chat.roles.includes(role)) return [];
  if (role !== "admin" && !canAccess("jd-chat")) return [];

  const organisation = BUSINESS_GROUPS.find((group) => group.id === "g-organisation");
  const accountPages = WORKSPACE_NAVIGATION.filter((entry) =>
    ["billing", "settings"].includes(entry.id)
    && entry.roles.includes(role)
    && (role === "admin" || canAccess(entry.id))
    && organisation?.pages.includes(entry.id)
  );
  if (!accountPages.length) return [{...chat}];

  return [
    {...chat},
    {id: organisation.id, group: organisation.group},
    ...accountPages.map((entry) => ({...entry, gid: organisation.id})),
  ];
}
