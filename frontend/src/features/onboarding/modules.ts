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

export const MODULE_CATALOG: CatalogModule[] = [
  {
    slug: "hrms",
    name: "HRMS",
    category: "Human Resource Management",
    summary: "Manage workforce profiles, attendance, leave, payroll, compensation, and performance from your Pulse workspace.",
    detail: "Manage workforce profiles, attendance, leave, payroll, compensation, and performance from your Pulse workspace.",
    pitch: "Add workforce and HR capabilities to your Pulse company workspace.",
    version: "2.4.0",
    installable: true,
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
  {
    slug: "crm",
    name: "CRM",
    category: "Customer Relationship Management",
    summary: "Track leads, manage customers, and follow the sales pipeline.",
    detail: "Track leads, customers, and the sales pipeline from your Pulse workspace.",
    pitch: "Add customer and pipeline capabilities to your Pulse company workspace.",
    version: "1.0.0",
    installable: false,
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
  {
    slug: "projects",
    name: "Project & Task Management",
    category: "Plan, track and deliver work",
    summary: "Create projects, assign work, and follow deadlines with the team.",
    detail: "Plan projects, assign work, and follow deadlines from your Pulse workspace.",
    pitch: "Add project and task capabilities to your Pulse company workspace.",
    version: "1.0.0",
    installable: false,
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
  {
    slug: "helpdesk",
    name: "Help Desk & Support",
    category: "Customer and internal requests",
    summary: "Create tickets, track status, and keep a history of support conversations.",
    detail: "Create tickets, track status, and keep support history in your Pulse workspace.",
    pitch: "Add support and ticket capabilities to your Pulse company workspace.",
    version: "1.0.0",
    installable: false,
    includes: ["Tickets", "Priorities", "Escalations", "Conversation history", "Support reports"],
    groups: [
      { title: "Tickets", items: ["Ticket records", "Assignment"] },
      { title: "Status", items: ["Priorities", "Status tracking"] },
      { title: "Escalations", items: ["Escalation rules", "Notifications"] },
      { title: "Reporting", items: ["Support reports"] },
    ],
    permissionSummary: "Adds a support permission set. Only full-access roles get it automatically.",
    permissionNote: "Help Desk adds its own permission set — Tickets, Escalations, and Reports — that you grant to company roles.",
    permissions: [
      { name: "Help Desk", actions: "view, manage" },
      { name: "Tickets", actions: "view, create, manage, assign" },
      { name: "Escalations", actions: "view, manage" },
      { name: "Support reports", actions: "view" },
    ],
    dataAreas: ["Stores tickets for this company.", "Writes notifications and audit log entries when a ticket changes."],
    configuration: ["Ticket priorities and statuses", "Escalation rules", "Assign support permissions to roles"],
    installSteps: ["Installing module", "Preparing tickets", "Preparing priorities", "Preparing escalations", "Preparing support reports"],
  },
  {
    slug: "inventory",
    name: "Inventory & Asset Management",
    category: "Products, stock and assets",
    summary: "Track products, stock movement, suppliers, and assigned assets.",
    detail: "Track products, stock, suppliers, and assigned assets from your Pulse workspace.",
    pitch: "Add inventory and asset capabilities to your Pulse company workspace.",
    version: "1.0.0",
    installable: false,
    includes: ["Products", "Stock", "Suppliers", "Assets", "Inventory reports"],
    groups: [
      { title: "Products", items: ["Product records", "Stock levels"] },
      { title: "Movement", items: ["Stock movements", "Low-stock alerts"] },
      { title: "Suppliers", items: ["Supplier records", "Purchase orders"] },
      { title: "Assets", items: ["Asset assignment", "Inventory reports"] },
    ],
    permissionSummary: "Adds an inventory permission set. Only full-access roles get it automatically.",
    permissionNote: "Inventory adds its own permission set — Products, Stock, Suppliers, Assets, and Reports — that you grant to company roles.",
    permissions: [
      { name: "Inventory", actions: "view, manage" },
      { name: "Products", actions: "view, create, manage" },
      { name: "Stock", actions: "view, adjust" },
      { name: "Assets", actions: "view, assign" },
      { name: "Inventory reports", actions: "view" },
    ],
    dataAreas: ["Stores products, stock, and assets for this company.", "Writes stock changes to the shared audit log."],
    configuration: ["Stock locations", "Low-stock thresholds", "Assign inventory permissions to roles"],
    installSteps: ["Installing module", "Preparing products", "Preparing stock", "Preparing suppliers", "Preparing assets"],
  },
  {
    slug: "finance",
    name: "Finance & Accounting",
    category: "Invoices, expenses and reports",
    summary: "Record invoices, expenses, and the summaries the company needs for its books.",
    detail: "Record invoices, expenses, and financial summaries from your Pulse workspace.",
    pitch: "Add finance and accounting capabilities to your Pulse company workspace.",
    version: "1.0.0",
    installable: false,
    includes: ["Invoices", "Expenses", "Summaries", "Tax details", "Bank reconciliation"],
    groups: [
      { title: "Invoices", items: ["Invoices", "Payments"] },
      { title: "Expenses", items: ["Expense records", "Expense categories"] },
      { title: "Books", items: ["Financial summaries", "Tax details where applicable"] },
      { title: "Banking", items: ["Bank reconciliation"] },
    ],
    permissionSummary: "Adds a finance permission set. Only full-access roles get it automatically.",
    permissionNote: "Finance adds its own permission set — Invoices, Expenses, and Reports — that you grant to company roles.",
    permissions: [
      { name: "Finance", actions: "view, manage" },
      { name: "Invoices", actions: "view, create, manage" },
      { name: "Expenses", actions: "view, create, manage" },
      { name: "Financial reports", actions: "view" },
    ],
    dataAreas: ["Stores invoices and expenses for this company.", "Writes financial changes to the shared audit log."],
    configuration: ["Invoice numbering", "Expense categories", "Assign finance permissions to roles"],
    installSteps: ["Installing module", "Preparing invoices", "Preparing expenses", "Preparing summaries", "Preparing reconciliation"],
  },
];

export function modulesBySlug(slugs: string[]) {
  return MODULE_CATALOG.filter((module) => slugs.includes(module.slug));
}
