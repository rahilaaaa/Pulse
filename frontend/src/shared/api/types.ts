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
    status: string;
  }>;
  platform_permissions: string[];
};

export type CompanyRow = {
  id: string;
  display_name: string;
  slug: string;
  status: "draft" | "active" | "suspended" | "closed";
  created_at: string;
  membership_count: number;
};

export type CompanyList = {
  results: CompanyRow[];
  page: number;
  page_size: number;
  count: number;
  page_count: number;
};

export type PlatformOverview = {
  companies: { total: number; by_status: Record<string, number> };
  users: { total: number; active: number; email_verified: number; in_companies: number };
  active_memberships: number;
  platform_grants: number;
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
  members: PlatformCompanyMember[];
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

export type RecordList = {
  results: unknown[];
  page: number;
  page_size: number;
  count: number;
  page_count: number;
};
