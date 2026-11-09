export type ModuleGroup = {
  title: string;
  items: string[];
  note?: string;
};

export type ModulePermission = {
  name: string;
  actions: string;
};

export type CatalogModule = {
  slug: string;
  name: string;
  category: string;
  summary: string;
  detail: string;
  pitch: string;
  version: string;
  includes: string[];
  groups: ModuleGroup[];
  permissionSummary: string;
  permissionNote: string;
  permissions: ModulePermission[];
  dataAreas: string[];
  configuration: string[];
  installSteps: string[];
  installable: boolean;
};

export type ApiOnboardingModule = {
  slug: string;
  name?: string;
  display_name?: string;
  category?: string;
  description?: string;
  summary?: string;
  detail?: string;
  pitch?: string;
  version?: string;
  installation_available?: boolean;
  installable?: boolean;
  includes?: string[];
  features_preview?: string[];
};

export const MODULE_METADATA_BY_SLUG: Record<string, Partial<CatalogModule>> = {
  hrms: {
    name: "HRMS",
    category: "Human Resource Management",
    summary: "Manage workforce profiles, attendance, leave, payroll, compensation, and performance from your Pulse workspace.",
    detail: "Manage workforce profiles, attendance, leave, payroll, compensation, and performance from your Pulse workspace.",
    pitch: "Add workforce and HR capabilities to your Pulse company workspace.",
    version: "2.5.0",
    includes: ["Workforce Management", "Leave", "Compensation", "HR Reports", "Attendance", "Payroll", "Performance"],
    groups: [
      { title: "Workforce", items: ["HR profiles", "Workforce directory"] },
      { title: "Attendance", items: ["Attendance records", "Attendance verification"] },
      { title: "Leave", items: ["Leave requests", "Leave approvals"] },
      { title: "Payroll", items: ["Payroll periods", "Payroll processing foundation"] },
      { title: "Compensation", items: ["Compensation information"] },
      { title: "Performance", items: ["Performance reviews"] },
      { title: "Reporting", items: ["HR reports"], note: "Uses your existing People as the identity — no duplicate employee records." },
    ],
    permissionSummary: "Adds 24 permissions. Only full-access roles get them automatically.",
    permissionNote: "Installing requires permission to install modules. HRMS adds its own permission set — Workforce, Attendance, Leave, Payroll, Compensation, Performance, Reports — that you grant to company roles.",
    permissions: [
      { name: "HRMS", actions: "view, manage" },
      { name: "Workforce", actions: "view, manage, view sensitive" },
      { name: "Attendance", actions: "view, manage, approve, sensitive (location)" },
      { name: "Leave", actions: "view, create, manage, approve" },
      { name: "Payroll", actions: "view, calculate, finalize, reverse" },
      { name: "Compensation", actions: "view, manage" },
      { name: "Performance", actions: "view, create, manage" },
      { name: "HR Reports", actions: "view" },
      { name: "HR Configuration", actions: "manage" },
    ],
    dataAreas: [
      "Extends existing People with an HR profile — no new identities.",
      "Uses your organization tree for scope.",
      "Writes to the shared notifications and audit log.",
      "Adds optional HR custom fields.",
    ],
    configuration: ["Employment types and work locations", "Attendance policy", "Leave types and policies", "Assign HRMS permissions to roles"],
    installSteps: [
      "Installing module",
      "Preparing workforce capabilities",
      "Preparing attendance",
      "Preparing leave",
      "Preparing payroll",
      "Preparing compensation",
      "Preparing performance",
      "Preparing HR configuration",
    ],
  },
  crm: {
    name: "CRM",
    category: "Customer Relationship Management",
    summary: "Track leads, manage customers, and follow the sales pipeline.",
    detail: "Track leads, customers, and the sales pipeline from your Pulse workspace.",
    pitch: "Add customer and pipeline capabilities to your Pulse company workspace.",
    version: "1.0.0",
    includes: ["Leads", "Pipeline", "Follow-ups", "Customer history", "Sales reports"],
    groups: [
      { title: "Leads", items: ["Lead records", "Lead sources"] },
      { title: "Pipeline", items: ["Deal stages", "Deal tracking"] },
      { title: "Follow-ups", items: ["Reminders", "Activity history"] },
      { title: "Reporting", items: ["Sales reports"] },
    ],
    permissionSummary: "Adds a CRM permission set. Only full-access roles get it automatically.",
    permissionNote: "CRM adds its own permission set — Leads, Deals, Follow-ups, and Reports — that you grant to company roles.",
    permissions: [
      { name: "CRM", actions: "view, manage" },
      { name: "Leads", actions: "view, create, manage" },
      { name: "Deals", actions: "view, manage" },
      { name: "Follow-ups", actions: "view, create, manage" },
      { name: "Sales reports", actions: "view" },
    ],
    dataAreas: ["Keeps customer records in this company workspace.", "Writes follow-ups to the shared notifications and audit log."],
    configuration: ["Pipeline stages", "Lead sources", "Assign CRM permissions to roles"],
    installSteps: ["Installing module", "Preparing customer records", "Preparing the pipeline", "Preparing follow-ups", "Preparing sales reports"],
  },
  projects: {
    name: "Project & Task Management",
    category: "Plan, track and deliver work",
    summary: "Create projects, assign work, and follow deadlines with the team.",
    detail: "Plan projects, assign work, and follow deadlines from your Pulse workspace.",
    pitch: "Add project and task capabilities to your Pulse company workspace.",
    version: "1.0.0",
    includes: ["Projects", "Tasks", "Assignments", "Deadlines", "Progress reports"],
    groups: [
      { title: "Projects", items: ["Project records", "Project members"] },
      { title: "Tasks", items: ["Task lists", "Priorities"] },
      { title: "Assignments", items: ["Assign to people", "Assign to teams"] },
      { title: "Reporting", items: ["Progress reports"] },
    ],
    permissionSummary: "Adds a project permission set. Only full-access roles get it automatically.",
    permissionNote: "Project & Task Management adds its own permission set — Projects, Tasks, and Reports — that you grant to company roles.",
    permissions: [
      { name: "Projects", actions: "view, create, manage" },
      { name: "Tasks", actions: "view, create, manage, assign" },
      { name: "Progress reports", actions: "view" },
    ],
    dataAreas: ["Stores projects and tasks for this company.", "Uses existing People for assignment.", "Writes updates to the shared audit log."],
    configuration: ["Project statuses", "Task priorities", "Assign project permissions to roles"],
    installSteps: ["Installing module", "Preparing projects", "Preparing tasks", "Preparing assignments", "Preparing progress reports"],
  },
  commerce: {
    name: "Commerce & POS",
    category: "Commerce & Sales",
    summary: "Manage product catalogs, inventory pricing, orders, and point-of-sale operations.",
    detail: "End-to-end commercial operations: product listings, price books, orders, invoices, and POS checkout.",
    pitch: "Sell products and process transactions directly in Pulse ERP.",
    version: "1.0.0",
    includes: ["Product Catalog", "Price Books", "Orders", "POS Registers", "Invoices"],
    groups: [
      { title: "Catalog", items: ["Product listings", "Categories", "Variants"] },
      { title: "Sales", items: ["Orders", "Customer accounts", "Price books"] },
      { title: "Checkout", items: ["POS terminal", "Payment recording"] },
    ],
    permissionSummary: "Adds commerce permissions. Granted to commercial staff.",
    permissionNote: "Adds permissions for Products, Orders, and Checkout.",
    permissions: [
      { name: "Commerce", actions: "view, manage" },
      { name: "Products", actions: "view, create, manage" },
      { name: "Orders", actions: "view, create, manage" },
    ],
    dataAreas: ["Stores commercial products and orders for this company."],
    configuration: ["Product categories", "Payment methods", "Tax rules"],
    installSteps: ["Installing module", "Preparing product catalog", "Preparing order workflows"],
  },
};

export function buildCatalogModule(apiItem: ApiOnboardingModule): CatalogModule {
  const meta = MODULE_METADATA_BY_SLUG[apiItem.slug] || {};
  const name = apiItem.name || apiItem.display_name || meta.name || apiItem.slug.toUpperCase();
  const includes =
    apiItem.includes && apiItem.includes.length > 0
      ? apiItem.includes
      : meta.includes || [name];
  const summary = apiItem.summary || apiItem.description || meta.summary || "";
  const detail = apiItem.detail || apiItem.description || meta.detail || summary;
  const pitch = apiItem.pitch || meta.pitch || detail;

  return {
    slug: apiItem.slug,
    name,
    category: apiItem.category || meta.category || "Operations",
    summary,
    detail,
    pitch,
    version: apiItem.version || meta.version || "1.0.0",
    includes,
    groups: meta.groups || [{ title: "Features", items: includes }],
    permissionSummary:
      meta.permissionSummary || `Adds permissions for ${name}. Only full-access roles get them automatically.`,
    permissionNote:
      meta.permissionNote || `Installing requires permission to install modules. Adds permissions for ${name}.`,
    permissions: meta.permissions || [{ name, actions: "view, manage" }],
    dataAreas: meta.dataAreas || [`Stores ${name} data for this company.`],
    configuration: meta.configuration || [`Assign ${name} permissions to roles`],
    installSteps: meta.installSteps || ["Installing module", `Preparing ${name} capabilities`],
    installable: apiItem.installation_available ?? apiItem.installable ?? true,
  };
}

export function resolveCatalogModules(apiList: ApiOnboardingModule[] = []): CatalogModule[] {
  return apiList.map(buildCatalogModule);
}

export function modulesBySlug(modules: CatalogModule[], slugs: string[]) {
  return modules.filter((module) => slugs.includes(module.slug));
}

export const MODULE_CATALOG: CatalogModule[] = [];
