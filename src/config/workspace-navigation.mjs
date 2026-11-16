// Legacy route/role catalogue retained for permission fallbacks and education layouts.
// Layout changes must not silently widen route access or rename database records.
const legacyEntries = [
    {id:"jd-chat",          label:"JD Assistant",    icon:"dashboard", roles:["admin","teacher","student","bursar","manager"]},
    {id:"jd-operations", label:"Business Operations", icon:"activity", roles:["admin","manager"]},
    {id:"dashboard",       label:"Overview",        icon:"dashboard", roles:["admin","teacher","student","bursar"]},
    // ── Admin groups ──
    {id:"g-academic",      group:"Operations",      roles:["admin","bursar"]},
    {id:"members",         label:"Team",           icon:"members", roles:["admin","manager","bursar"],    gid:"g-academic"},
    {id:"students",        label:"People",          icon:"students", roles:["admin"],    gid:"g-academic"},
    {id:"teachers",        label:"Team",          icon:"teachers", roles:["admin"],    gid:"g-academic"},
    {id:"classes",         label:"Groups",           icon:"classes", roles:["admin"],    gid:"g-academic"},
    {id:"subjects",        label:"Categories",          icon:"subjects", roles:["admin"],    gid:"g-academic"},
    {id:"sections",        label:"Divisions",          icon:"sections", roles:["admin"],    gid:"g-academic"},
    {id:"calendar",        label:"Calendar", icon:"calendar",    roles:["admin","teacher"], gid:"g-academic"},
    {id:"timetable",       label:"Schedule",         icon:"timetable",   roles:["admin","teacher"], gid:"g-academic"},
    {id:"broadsheet",      label:"Performance Matrix",        icon:"broadsheet",  roles:["admin"],           gid:"g-academic"},
    {id:"g-results",       group:"Performance",        roles:["admin"]},
    {id:"assignments",     label:"Assignments",       icon:"assignments", roles:["admin"],    gid:"g-results"},
    {id:"results",         label:"Performance Records",           icon:"results", roles:["admin"],    gid:"g-results"},
    {id:"report-cards",    label:"Reports",      icon:"report-cards", roles:["admin","teacher"], gid:"g-results"},
    {id:"transcript",      label:"History",        icon:"transcript", roles:["admin","student"],  gid:"g-results"},
    {id:"academic-summary",label:"Analytics",icon:"academic-summary",roles:["admin"],     gid:"g-results"},
    {id:"report-card-settings",label:"Report Settings", icon:"report-settings", roles:["admin"], gid:"g-results"},
    {id:"grading",         label:"Scoring & Rubrics",     icon:"grading", roles:["admin"],    gid:"g-results"},
    {id:"g-fees",          group:"Billing",           roles:["admin","bursar"]},
    {id:"fee-items",       label:"Billing Items",         icon:"fee-items", roles:["admin","manager","bursar"],    gid:"g-fees"},
    {id:"fee-templates",   label:"Billing Templates",         icon:"fee-templates", roles:["admin","manager","bursar"],    gid:"g-fees"},
    {id:"fee-generate",    label:"Generate Bills",    icon:"fee-generate", roles:["admin","manager","bursar"],    gid:"g-fees"},
    {id:"fee-tracker",     label:"Payment Tracker",   icon:"fee-tracker", roles:["admin","manager","bursar"],    gid:"g-fees"},
    {id:"fee-stats",       label:"Billing Analytics",        icon:"fee-stats", roles:["admin","manager","bursar"],    gid:"g-fees"},
    {id:"g-comms",         group:"Communication",  roles:["admin","teacher","bursar"]},
    {id:"announce",        label:"Notices",     icon:"announce", roles:["admin","teacher","manager","bursar"], gid:"g-comms"},
    {id:"attendance",      label:"Attendance",        icon:"attendance", roles:["admin","teacher"], gid:"g-comms"},
    {id:"mail-compose",    label:"Send Email",        icon:"mail",  roles:["admin"],    gid:"g-comms"},
    {id:"mail-logs",       label:"Email Logs",        icon:"mail-logs", roles:["admin"],    gid:"g-comms"},
    {id:"g-admin",         group:"Administration",  roles:["admin"]},
    {id:"admin-tools",     label:"Admin Tools",        icon:"database",   roles:["admin"],    gid:"g-admin"},
    {id:"org-create",      label:"Register Organization", icon:"building", roles:["admin"],   gid:"g-admin"},
    {id:"hiring",          label:"Hiring",              icon:"user-check", roles:["admin"],   gid:"g-admin"},
    {id:"notifications",   label:"Notifications",      icon:"bell",       roles:["admin"],    gid:"g-admin"},
    {id:"permissions",     label:"Permissions",        icon:"shield",     roles:["admin"],    gid:"g-admin"},
    {id:"g-approvals",     group:"Approvals",      roles:["admin"]},
    {id:"approvals",       label:"People Approvals", icon:"approvals", roles:["admin"],    gid:"g-approvals"},
    {id:"access-requests", label:"Access Requests",   icon:"approvals", roles:["admin"],    gid:"g-approvals"},
    // ── Staff-only (flat) ──
    {id:"my-classes",      label:"My Groups",        icon:"my-classes", roles:["teacher"]},
    {id:"results-teach",   label:"Upload Records",    icon:"upload-results", roles:["teacher"]},
    {id:"add-students",    label:"Add People",      icon:"add-students", roles:["teacher"]},
    {id:"request-access",  label:"Request Access",    icon:"approvals",  roles:["teacher"]},
    // ── Member-only ──
    {id:"my-results",      label:"My Reports",    icon:"my-results", roles:["student"]},
    {id:"my-payments",     label:"My Payments",       icon:"my-payments", roles:["student"]},
    {id:"my-bill",         label:"My Bill",           icon:"receipt", roles:["student"]},
  ];
export const LEGACY_NAVIGATION = Object.freeze(legacyEntries.map((entry) => Object.freeze({
  ...entry, roles: Object.freeze([...entry.roles]),
})));

// Settings already exists as an admin header action. Give business workspaces one
// searchable destination rather than duplicated mobile/desktop header actions.
export const WORKSPACE_NAVIGATION = Object.freeze([
  ...LEGACY_NAVIGATION,
  Object.freeze({id:"settings",label:"Organisation Settings",icon:"settings",roles:Object.freeze(["admin"])}),
]);

export const BUSINESS_GROUPS = Object.freeze([
  {id:"g-people",group:"People & Recruitment",pages:["members","students","teachers","hiring","add-students"]},
  {id:"g-operations",group:"Operations",pages:["classes","subjects","sections","calendar","timetable","attendance","assignments","my-classes"]},
  {id:"g-finance",group:"Finance",pages:["fee-generate","fee-tracker","fee-items","fee-templates","fee-stats","my-bill","my-payments"]},
  {id:"g-reports",group:"Reports & Analytics",pages:["results","broadsheet","report-cards","transcript","academic-summary","report-card-settings","grading","results-teach","my-results"]},
  {id:"g-communications",group:"Communications",pages:["announce","mail-compose","mail-logs","notifications"]},
  {id:"g-review",group:"Approvals & Access",pages:["approvals","access-requests","request-access"]},
  {id:"g-organisation",group:"Organisation",pages:["permissions","settings","admin-tools","org-create"]},
].map((group) => Object.freeze({...group,pages:Object.freeze(group.pages)})));

const businessLabels = Object.freeze({
  dashboard:"Business Overview", "jd-operations":"Tasks & Operations",
  members:"People directory", students:"Member records", teachers:"Staff records",
  hiring:"Recruitment", "org-create":"Register organisation",
});

export function usesEducationNavigation(workspaceType, educationModuleEnabled) {
  return workspaceType === "education" && educationModuleEnabled === true;
}

export function businessGroupForPage(page) {
  return BUSINESS_GROUPS.find((group) => group.pages.includes(page))?.id;
}

export function defaultCollapsedGroups(workspaceType, educationModuleEnabled, page) {
  if (usesEducationNavigation(workspaceType, educationModuleEnabled)) return new Set();
  const active = businessGroupForPage(page);
  return new Set(BUSINESS_GROUPS.filter((group) => group.id !== active).map((group) => group.id));
}

// Authority remains in backend policies and the existing canAccess resolver.
// Derive groups from permitted children: never leave an orphan or empty header.
export function buildWorkspaceNavigation({role, canAccess = () => false, workspaceType, educationModuleEnabled, educationLabels = {}}) {
  const education = usesEducationNavigation(workspaceType, educationModuleEnabled);
  const source = education ? LEGACY_NAVIGATION : WORKSPACE_NAVIGATION;
  const permitted = new Map();
  for (const entry of source) {
    if (entry.group || !entry.roles.includes(role) || permitted.has(entry.id)) continue;
    if (role !== "admin" && !canAccess(entry.id)) continue; // Preserve existing admin semantics.
    const label = education ? educationLabels[entry.id] : businessLabels[entry.id];
    permitted.set(entry.id, label ? {...entry,label} : {...entry});
  }
  if (education) {
    const headerIds = new Set();
    const output = [];
    const groups = new Map(source.filter((entry) => entry.group).map((entry) => [entry.id,entry]));
    for (const entry of source) {
      if (!entry.group && permitted.has(entry.id)) {
        const page = permitted.get(entry.id);
        if (page.gid && !headerIds.has(page.gid)) {
          const header = groups.get(page.gid);
          if (header) {output.push({...header,group:educationLabels[header.id] || header.group});headerIds.add(header.id);}
        }
        output.push(page);
        permitted.delete(entry.id);
      }
    }
    return output;
  }
  const output = [];
  const take = (id, gid) => {
    if (!permitted.has(id)) return;
    const page = {...permitted.get(id)};
    if (gid) page.gid = gid; else delete page.gid;
    output.push(page); permitted.delete(id);
  };
  for (const id of ["jd-chat","dashboard","jd-operations"]) take(id);
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
