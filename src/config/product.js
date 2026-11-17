/**
 * Product identity and terminology.
 *
 * JAMES-DENNING is a multi-industry business operations workspace. Some database
 * tables and columns keep their original names (see docs/LEGACY_SCHEMA.md); the
 * product surface always uses the business terminology below.
 */

export const PRODUCT = {
  name: "JAMES-DENNING",
  shortName: "JD",
  title: "JAMES-DENNING — Organization Operations Platform",
  tagline: "A clearer way to run your organization.",
  description: "Monitor business activity, manage people and workflows, and turn operations data into useful insights.",
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
  { value: "other", label: "Other", description: "Use the core workspace with your own terminology." },
];

export const MODULES = {
  core: {
    label: "Core operations",
    description: "AI workforce, operations, approvals, people and reporting.",
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

export function getTerms() {
  return BUSINESS_TERMS;
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
