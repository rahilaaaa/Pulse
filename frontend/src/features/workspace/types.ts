export type WorkspacePayload = {
  company: { id: string; legal_name: string; display_name: string; slug: string; status: string; timezone: string; suspended_at?: string | null; closed_at?: string | null; status_reason?: string | null };
  permissions: string[];
  navigation: Array<{ code: string; label: string }>;
  subscription: { status: string; plan_name: string; billing_interval: string; trial_ends_at: string | null } | null;
  dashboard: { widgets: Array<{ code: string; title: string; data: Record<string, unknown> }> };
};

export type OverviewPayload = {
  company: {
    display_name: string;
    legal_name: string;
    status: string;
    slug: string;
    timezone?: string;
    country_code?: string;
    created_at?: string;
  };
  billing?: { billing_name: string; billing_email: string; gstin: string; country_code: string } | null;
  subscription: WorkspacePayload["subscription"];
  users: { total: number; active: number; invited: number; suspended: number; no_login?: number; joined_this_month?: number };
  people?: number;
  units?: number;
  roles: number;
  custom_roles: number;
  installed_modules: number;
  available_modules: number;
  modules?: Array<{ slug: string; name: string; description: string }>;
  pending_invitations: number;
  module_issues: Array<{ slug: string; error: string }>;
  activity: Array<{ action: string; object_type?: string; created_at: string; actor_email: string | null; actor_name?: string | null }>;
};

export type PersonRow = {
  id: string;
  person_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  job_title: string;
  status: string;
  organization: string;
  department_id: string | null;
  membership_id: string | null;
  membership_status: string | null;
  roles: Array<{ id: string; name: string; is_owner_role?: boolean }>;
  last_login: string | null;
  permissions: string[];
  custom_data?: Record<string, unknown>;
};

export type MePayload = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  memberships: Array<{ company_id: string; company_display_name: string; status: string }>;
};

export const NAV_PATHS: Record<string, string> = {
  dashboard: "/app",
  users: "/app/people",
  organization: "/app/organization",
  roles: "/app/roles",
  studio: "/app/studio",
  modules: "/app/modules",
  settings: "/app/settings",
  audit: "/app/audit",
  hrms: "/app/hrms",
};
