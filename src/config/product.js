/**
 * Product identity and terminology.
 *
 * The database still uses the original school-oriented table/column names for
 * backwards compatibility. This file is the presentation layer: new tenants
 * see business-neutral language while existing education tenants can keep the
 * education module enabled without a schema migration.
 */

export const PRODUCT = {
  name: "JAMES-DENNING",
  shortName: "JD",
  title: "JAMES-DENNING — Business Operations Platform",
  tagline: "A clearer way to run your organization.",
  description: "Manage people, teams, operations, billing, performance, and communication in one connected workspace. Education tools remain available as an optional industry module.",
  version: "v32.92",
  defaultIndustry: "business",
  defaultModule: "core",
};

export const INDUSTRIES = [
  { value: "business", label: "General business", description: "A flexible workspace for any organization." },
  { value: "professional-services", label: "Professional services", description: "Clients, teams, projects, and billing." },
  { value: "retail", label: "Retail and commerce", description: "People, locations, products, and payments." },
  { value: "nonprofit", label: "Nonprofit", description: "Members, programs, contributions, and reporting." },
  { value: "healthcare", label: "Health and wellness", description: "People, practitioners, schedules, and records." },
  { value: "education", label: "Education", description: "Enable education terminology and academic workflows." },
  { value: "other", label: "Other", description: "Use the core workspace with your own terminology." },
];

export const EDUCATION_NAV_LABELS = {
  dashboard:"Dashboard", "g-academic":"Academic", members:"Members", students:"Students", teachers:"Staff", classes:"Classes", subjects:"Subjects", sections:"Sections", calendar:"Academic Calendar", timetable:"Timetable", broadsheet:"Broadsheet", "g-results":"Results", assignments:"Assignments", results:"Results", "report-cards":"Report Cards", transcript:"Transcript", "academic-summary":"Academic Analytics", "report-card-settings":"Report Card Settings", grading:"Grading & CAE", "g-fees":"Fees", "fee-items":"Fee Items", "fee-templates":"Templates", "fee-generate":"Generate Bills", "fee-tracker":"Payment Tracker", "fee-stats":"Statistics", announce:"Announcements", attendance:"Attendance", "mail-compose":"Send Email", "mail-logs":"Email Logs", "g-admin":"Administration", "g-approvals":"Approvals", approvals:"Member Approvals", "access-requests":"Access Requests", "my-classes":"My Classes", "results-teach":"Upload Results", "add-students":"Add Students", "my-results":"My Report Card", "my-payments":"My Payments", "my-bill":"My Bill",
};

export const MODULES = {
  core: {
    label: "Core operations",
    description: "People, staff, groups, communication, billing, activity, and reporting.",
  },
  education: {
    label: "Education module",
    description: "Academic periods, grading, results, report cards, transcripts, and attendance.",
  },
};

/** Business-neutral labels used in the shared shell and new surfaces. */
export const BUSINESS_TERMS = {
  organization: "Organization",
  organizations: "Organizations",
  people: "People",
  person: "Person",
  member: "Member",
  members: "Members",
  staff: "Staff",
  group: "Group",
  groups: "Groups",
  category: "Category",
  categories: "Categories",
  cycle: "Cycle",
  cycles: "Cycles",
  period: "Period",
  periods: "Periods",
  performance: "Performance",
  performances: "Performance records",
  report: "Report",
  reports: "Reports",
  billing: "Billing",
  payment: "Payment",
  payments: "Payments",
  finance: "Finance",
  notice: "Notice",
  notices: "Notices",
  activity: "Activity",
  id: "Member ID",
};

/** Original education labels remain available for education tenants. */
export const EDUCATION_TERMS = {
  organization: "School",
  organizations: "Schools",
  people: "Students",
  person: "Student",
  member: "Student",
  members: "Students",
  staff: "Teachers",
  group: "Class",
  groups: "Classes",
  category: "Subject",
  categories: "Subjects",
  cycle: "Session",
  cycles: "Sessions",
  period: "Term",
  periods: "Terms",
  performance: "Results",
  performances: "Results",
  report: "Report Card",
  reports: "Report Cards",
  billing: "Fees",
  payment: "Payment",
  payments: "Payments",
  finance: "Bursary",
  notice: "Announcement",
  notices: "Announcements",
  activity: "Activity",
  id: "Student ID",
};

export function getTerms(workspaceType = PRODUCT.defaultIndustry) {
  return workspaceType === "education" ? EDUCATION_TERMS : BUSINESS_TERMS;
}

export function getIndustryLabel(value) {
  return INDUSTRIES.find(item => item.value === value)?.label || INDUSTRIES[0].label;
}

export function getStoredWorkspaceType() {
  try {
    return localStorage.getItem("jd_workspace_type") || PRODUCT.defaultIndustry;
  } catch {
    return PRODUCT.defaultIndustry;
  }
}

export function storeWorkspaceType(value) {
  try { localStorage.setItem("jd_workspace_type", value || PRODUCT.defaultIndustry); } catch {}
}
