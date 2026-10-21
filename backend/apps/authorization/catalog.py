COMPANY_PERMISSIONS = [
    ("company.view", "Read the company and workspace bootstrap.", None),
    ("company.update", "Update the company display name and timezone.", None),
    ("membership.view", "List company memberships.", None),
    ("membership.invite", "Create, resend, and revoke invitations.", None),
    ("membership.update", "Suspend or reactivate a membership.", None),
    ("membership.remove", "Remove a membership.", None),
    ("people.view", "List people in the company.", None),
    ("people.create", "Create a person.", None),
    ("people.update", "Update a person.", None),
    ("people.deactivate", "Set a person inactive.", None),
    ("departments.view", "List departments.", None),
    ("departments.manage", "Create and update departments.", None),
    ("roles.view", "List roles and their permissions.", None),
    ("roles.manage", "Create roles, edit permissions, and assign roles.", None),
    ("modules.view", "View the module catalog and installation state.", None),
    ("modules.install", "Install and retry a module.", None),
    ("modules.configure", "Update module installation config.", None),
    ("modules.uninstall", "Mark a module uninstalled without deleting its business rows.", None),
    ("billing.view", "View the company subscription.", None),
    ("billing.manage", "Update the company billing profile.", None),
    ("dashboards.view", "View the dashboard assigned to the caller.", None),
    ("dashboards.manage", "Edit and publish role dashboards.", None),
    ("audit.view", "Read the company audit log.", None),
    ("hrms.leave.view", "Read leave policies and requests.", "hrms"),
    ("hrms.leave.request", "Create a leave request for the caller's person.", "hrms"),
    ("hrms.leave.decide", "Approve or reject leave requests.", "hrms"),
]

OWNER_FLOOR = ("company.update", "roles.manage", "billing.manage", "membership.invite")

HR_MANAGER = (
    "company.view",
    "membership.view",
    "membership.invite",
    "people.view",
    "people.create",
    "people.update",
    "people.deactivate",
    "departments.view",
    "departments.manage",
    "hrms.leave.view",
    "hrms.leave.request",
    "hrms.leave.decide",
    "dashboards.view",
)
DEPARTMENT_MANAGER = (
    "company.view",
    "people.view",
    "people.update",
    "departments.view",
    "hrms.leave.view",
    "hrms.leave.decide",
    "dashboards.view",
)
EMPLOYEE = (
    "company.view",
    "people.view",
    "dashboards.view",
    "hrms.leave.view",
    "hrms.leave.request",
)

ROLE_TEMPLATES = [
    ("owner", "Owner", "Every company permission. This role cannot be removed while it is the last owner.", True, None),
    ("administrator", "Administrator", "Every company permission. This role is not the protected owner.", False, None),
    ("hr_manager", "HR Manager", "People, invitations, and leave decisions.", False, HR_MANAGER),
    ("department_manager", "Department Manager", "People in view and leave decisions.", False, DEPARTMENT_MANAGER),
    ("employee", "Employee", "Workspace view and the caller's own leave requests.", False, EMPLOYEE),
]

NAV_CATALOG = [
    ("dashboard", "Dashboard", "company.view", None),
    ("users", "User Management", "membership.view", None),
    ("organization", "Organization", "departments.view", None),
    ("roles", "Roles & Permissions", "roles.view", None),
    ("studio", "Dashboard Studio", "dashboards.manage", None),
    ("modules", "Module Management", "modules.view", None),
    ("settings", "Company Settings", "company.update", None),
    ("audit", "Audit Logs", "audit.view", None),
    ("hrms", "HRMS Leave", "hrms.leave.view", "hrms"),
]

PLATFORM_PERMISSIONS = [
    ("platform.companies.view", "View companies, lifecycle, and usage summaries."),
    ("platform.companies.manage", "Suspend, reactivate, and close companies."),
    ("platform.users.view", "View global user and membership metrics."),
    ("platform.billing.view", "View subscriptions, invoices, payments, refunds, and revenue."),
    ("platform.billing.manage", "Execute refunds."),
    ("platform.modules.manage", "View module adoption and manage the catalog."),
    ("platform.operations.view", "View failed webhooks, failed tasks, and health."),
    ("platform.audit.view", "View platform audit logs."),
]
