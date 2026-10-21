export type MfaChallenge = {
  mfa_required: true;
  step: "enroll" | "verify";
  secret?: string;
  otpauth_uri?: string;
  qr_svg?: string;
};

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
  users: { total: number; active: number; mfa_enabled: number };
  active_memberships: number;
  platform_grants: number;
};

export type UserRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  email_verified: boolean;
  mfa_enabled: boolean;
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

export type RecordList = {
  results: unknown[];
  page: number;
  page_size: number;
  count: number;
  page_count: number;
};
