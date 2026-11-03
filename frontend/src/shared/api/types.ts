export type CurrentUser = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  email_verified: boolean;
  memberships: Array<{
    company_id: string;
    company_slug: string;
    company_display_name: string;
    company_status?: string;
    status: string;
  }>;
  platform_permissions: string[];
};

export type CompanyRow = {
  id: string;
  display_name: string;
  legal_name?: string;
  slug: string;
  status: "draft" | "active" | "suspended" | "closed";
  country_code?: string;
  timezone?: string;
  created_at: string;
  suspended_at?: string | null;
  closed_at?: string | null;
  membership_count: number;
  installed_modules_count?: number;
  subscription?: {
    plan_code: string;
    plan_name: string;
    status: string;
    billing_interval: string;
    currency: string;
  } | null;
};

export type CompanyList = {
  results: CompanyRow[];
  page: number;
  page_size: number;
  count: number;
  page_count: number;
};

export type PlatformOverview = {
  companies: {
    total: number;
    by_status: Record<string, number>;
    active: number;
    draft: number;
    suspended: number;
    closed: number;
  };
  memberships: {
    total: number;
    active: number;
    pending_invitations: number;
  };
  modules: {
    total_catalog: number;
    total_installed: number;
    adoption: Array<{
      slug: string;
      name: string;
      installed_count: number;
    }>;
  };
  billing: {
    committed_mrr_minor: number;
    committed_arr_minor: number;
    mrr_residual_minor: number;
    mrr_at_risk_minor: number;
    currency: string;
    subscriptions_count: {
      total: number;
      active: number;
      trialing: number;
      past_due: number;
      canceled: number;
      incomplete: number;
      unpaid: number;
      expiring_in_30_days: number;
    };
  };
  users: {
    total: number;
    active: number;
    email_verified: number;
    in_companies: number;
  };
  platform_grants: number;
  trends: {
    company_growth: Array<{
      key: string;
      label: string;
      count: number;
    }>;
    lifecycle_distribution: Record<string, number>;
    plan_distribution: Record<string, number>;
  };
  recent_activity: Array<{
    id: string;
    action: string;
    object_type: string;
    actor_email: string;
    actor_name: string;
    company_id: string | null;
    company_name: string | null;
    created_at: string;
  }>;
};

export type PlatformCompanyMember = {
  membership_id: string;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  email_verified: boolean;
  membership_status: string;
  roles: string[];
  joined_at: string | null;
  created_at: string;
};

export type PlatformCompanyDetail = CompanyRow & {
  legal_name: string;
  timezone: string;
  country_code: string;
  installed_modules_count: number;
  subscription: {
    status: string;
    plan_code: string;
    plan_name: string;
    billing_interval: string;
    currency: string;
    amount_minor: number;
    trial_ends_at: string | null;
  } | null;
  member_summary: {
    total_members: number;
    active_members: number;
    pending_invitations: number;
    owners_count: number;
    managers_count: number;
  };
  members?: PlatformCompanyMember[];
};

export type PlatformCompanyDashboard = {
  company: {
    id: string;
    display_name: string;
    legal_name: string;
    slug: string;
    status: CompanyRow["status"];
    timezone: string;
    country_code: string;
    created_at: string;
    suspended_at: string | null;
    closed_at: string | null;
  };
  people: {
    people_total: number;
    people_active: number;
    memberships_active: number;
    memberships_suspended: number;
    memberships_invited: number;
    pending_invitations: number;
  };
  organization: {
    units_count: number;
    roles_count: number;
  };
  modules: Array<{
    slug: string;
    name: string;
    status: string;
    version: string;
    installed_at: string | null;
  }>;
  installed_modules_count: number;
  billing: {
    billing_name: string;
    billing_email: string;
    gstin: string;
    country_code: string;
  } | null;
  subscription: {
    status: string;
    plan_code: string;
    plan_name: string;
    billing_interval: string;
    currency: string;
    amount_minor: number;
    trial_ends_at: string | null;
  } | null;
};

export type UserRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
  last_login?: string | null;
  membership_count: number;
  platform_grant_count: number;
};

export type UserList = {
  results: UserRow[];
  page: number;
  page_size: number;
  count: number;
  page_count: number;
};

export type PlatformPermission = {
  code: string;
  description: string;
  active_grants_count?: number;
};

export type PlatformUserDetail = UserRow & {
  permission_codes: string[];
  memberships: Array<{
    company_id: string;
    company_display_name: string;
    company_slug: string;
    status: string;
  }>;
  created?: boolean;
  invite_sent?: boolean;
};

export type PlatformModuleRow = {
  slug: string;
  display_name: string;
  description: string;
  version: string;
  category: string;
  icon: string;
  is_core: boolean;
  is_public: boolean;
  installation_available: boolean;
  installed_companies_count: number;
  dependencies: string[];
};

export type PlatformModuleDetail = Omit<PlatformModuleRow, "dependencies"> & {
  problem_solved: string;
  target_users: string;
  features: Array<{ id: string; title: string; description: string }>;
  config_schema: Record<string, unknown>;
  dependencies: Array<{ slug: string; display_name: string; version: string }>;
  installed_companies: Array<{
    company_id: string;
    display_name: string;
    slug: string;
    installed_version: string;
    installed_at: string | null;
  }>;
};

export type PlatformSubscriptionRow = {
  id: string;
  company_id: string;
  company_name: string;
  company_slug: string;
  company_status: string;
  plan_code: string;
  plan_name: string;
  billing_interval: string;
  currency: string;
  amount_minor: number;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
};

export type PlatformBillingPlan = {
  id: string;
  code: string;
  name: string;
  description: string;
  is_active: boolean;
  is_public: boolean;
  trial_days: number;
  prices: Array<{
    id: string;
    billing_interval: string;
    currency: string;
    amount_minor: number;
    is_active: boolean;
  }>;
  entitlements: Record<string, unknown>;
  active_subscriptions_count: number;
};

export type PlatformSettingsData = {
  grace_period_days: number;
  company_registration_enabled: boolean;
  default_plan_code: string;
  maintenance_mode: boolean;
  platform_banner_message?: string;
};

export type PlatformHealthData = {
  status: "healthy" | "unhealthy";
  app_version: string;
  timestamp: string;
  database: {
    connected: boolean;
    engine: string;
    latency_ms: number;
  };
  operations: {
    total_companies: number;
    active_companies: number;
    audits_last_24h: number;
  };
};

export type PlatformOnboardingCompany = {
  id: string;
  display_name: string;
  slug: string;
  created_at: string | null;
  owner_email: string;
  profile_completed: boolean;
  plan_selected: boolean;
  subscription_activated: boolean;
};

export type PlatformOnboardingData = {
  draft_companies_count: number;
  pending_invitations_count: number;
  companies: PlatformOnboardingCompany[];
};

export type PlatformAuditRow = {
  id: string;
  action: string;
  object_type: string;
  object_id: string | null;
  actor_user_id: string | null;
  actor_email: string;
  actor_name: string;
  company_id: string | null;
  company_name: string | null;
  request_id: string | null;
  ip_address: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
};

export type RecordList = {
  results: unknown[];
  page: number;
  page_size: number;
  count: number;
  page_count: number;
};
