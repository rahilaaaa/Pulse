export type Readiness = {
  ready: boolean;
  activated: boolean;
  reason?: string;
  reasons?: string[];
};

export type Activation = {
  status: string;
  readiness: {
    employee_leave: Readiness;
    attendance: Readiness;
    payroll: Readiness;
  };
};

export type EligiblePerson = {
  id: string;
  person_id: string;
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  designation: string;
  department_id?: string | null;
  department_name?: string;
  branch_id?: string | null;
  branch_name?: string;
  login_status: "active" | "invited" | "no_account" | "suspended";
  has_login: boolean;
  invitation_status: string;
};

export type Employment = {
  id: string;
  person_id: string;
  person_name: string;
  person_email?: string;
  employee_number: string;
  job_title: string;
  employment_type: string;
  status: string;
  starts_on: string;
  ends_on?: string | null;
  legal_entity_id?: string;
  legal_entity_name: string;
  department_id?: string;
  department_name: string;
  branch_id?: string | null;
  branch_name?: string;
  work_location_id?: string;
  work_location_name: string;
  manager_id?: string;
  manager_employment_id?: string | null;
  manager_name?: string;
  login_status?: "active" | "invited" | "no_account" | "suspended";
  has_login?: boolean;
  invitation_status?: string;
  invitation_id?: string | null;
};

export type AttendanceRow = {
  id: string;
  work_date: string;
  status: string;
  timezone: string;
  shift: string;
  check_in: string | null;
  check_out: string | null;
  minutes_worked: number;
};

export type AttendanceCorrectionRow = {
  id: string;
  employment_id: string;
  employee_name: string;
  requested_check_in: string | null;
  requested_check_out: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requested_by_email?: string;
  decided_at?: string | null;
  decision_note?: string;
  created_at: string;
};

export type AttendanceExceptionRow = {
  id: string;
  employment_id: string;
  employee_name: string;
  exception_type: string;
  status: "open" | "resolved" | "dismissed";
  resolution_note?: string;
  created_at: string;
};

export type TeamMember = {
  id: string;
  person_name: string;
  employee_number: string;
  job_title: string;
  department_name: string;
  work_location_name: string;
  status: string;
  starts_on: string;
};

export type TeamAttendanceRow = {
  employment_id: string;
  employee_name: string;
  job_title: string;
  work_date: string;
  status: string;
  check_in: string | null;
  check_out: string | null;
  minutes_worked: number;
};

export type TeamCalendarEvent = {
  id: string;
  employee_name: string;
  event_type: "leave" | "holiday";
  start_date: string;
  end_date: string;
  label: string;
  status?: string;
};

export type DesignationRow = {
  id: string;
  name: string;
  code: string;
  description: string;
};

export type LegalEntityRow = {
  id: string;
  name: string;
  code: string;
  registration_number: string;
  country: string;
  status: string;
};

export type WorkLocationRow = {
  id: string;
  name: string;
  code: string;
  timezone: string;
  address_line1?: string;
  city?: string;
  country?: string;
  is_active: boolean;
};

export type ShiftRow = {
  id: string;
  name: string;
  code: string;
  start_time: string;
  end_time: string;
  grace_period_minutes: number;
};

export type OnboardingTaskRow = {
  id: string;
  employment_id: string;
  employee_name: string;
  title: string;
  category: "document" | "it_setup" | "orientation" | "policy" | "general";
  status: "pending" | "in_progress" | "completed" | "waived";
  due_date: string | null;
  completed_at: string | null;
  notes: string;
  created_at: string;
};

export type OffboardingTaskRow = {
  id: string;
  employment_id: string;
  employee_name: string;
  title: string;
  category: "asset_return" | "access_revocation" | "exit_interview" | "finance_clearance" | "general";
  status: "pending" | "in_progress" | "completed" | "waived";
  assigned_to_email?: string;
  due_date: string | null;
  completed_at: string | null;
  notes: string;
  created_at: string;
};

export type EmployeeDocumentRow = {
  id: string;
  employment_id: string;
  employee_name: string;
  title: string;
  category: "identity" | "tax" | "contract" | "qualification" | "payroll" | "other";
  status: "pending" | "verified" | "rejected";
  is_sensitive: boolean;
  document_url: string;
  verified_at: string | null;
  verification_notes: string;
  created_at: string;
};

export type HRRequestRow = {
  id: string;
  employment_id: string;
  employee_name: string;
  category: "general" | "payroll" | "benefits" | "policy" | "grievance";
  priority: "low" | "medium" | "high" | "urgent";
  status: "submitted" | "in_progress" | "resolved" | "closed";
  subject: string;
  description: string;
  resolution: string;
  assigned_to_email?: string;
  resolved_at: string | null;
  created_at: string;
};

export type ApprovalDelegationRow = {
  id: string;
  delegator_id: string;
  delegator_name: string;
  delegatee_id: string;
  delegatee_name: string;
  scope: string;
  starts_on: string;
  ends_on: string;
  reason: string;
  is_active: boolean;
};

export type CompensationRow = {
  employment_id: string;
  structure_name: string;
  monthly_base_salary: string;
  currency: string;
  currency_precision: number;
  effective_from: string;
};

export type SalaryComponentRow = {
  id: string;
  name: string;
  code: string;
  component_type: "earning" | "deduction";
  is_statutory: boolean;
  is_taxable: boolean;
  is_active: boolean;
};

export type SalaryStructureRow = {
  id: string;
  name: string;
  code: string;
  currency: string;
  currency_precision: number;
  is_active: boolean;
};

export type PayrollPeriodRow = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  status: string;
};

export type PayrollRunRow = {
  id: string;
  period_name: string;
  period_starts_on: string;
  period_ends_on: string;
  status: "draft" | "calculated" | "approved" | "rejected" | "finalized" | "reversed";
  calculation_version: number;
  line_count: number;
  total_gross: string;
  total_deductions: string;
  total_net: string;
  currency: string;
  created_at: string;
};

export type PayrollLineRow = {
  id: string;
  employment_id: string;
  employee_name: string;
  base_salary: string;
  gross_pay: string;
  total_deductions: string;
  net_pay: string;
  status: string;
  currency: string;
  line_details?: {
    earnings?: Array<{ name: string; amount: number }>;
    deductions?: Array<{ name: string; amount: number }>;
  };
};

export type PayslipRow = {
  id: string;
  run_id: string;
  period: string;
  issued_at: string;
  gross_salary?: string;
  net_salary?: string;
  currency?: string;
  snapshot: {
    outputs?: Record<string, unknown>;
  };
};

export type HrmsDashboardOverview = {
  headcount?: {
    total?: number;
    active?: number;
    pending?: number;
    on_leave?: number;
  };
  tasks?: {
    open_onboarding?: number;
    open_offboarding?: number;
  };
  attendance?: {
    open_exceptions?: number;
    pending_corrections?: number;
  };
  requests?: {
    open_hr_requests?: number;
  };
  documents?: {
    pending_verification?: number;
  };
  attendance_today?: {
    date?: string;
    present?: number;
    total_logged?: number;
  };
  pending_actions?: {
    leave_requests?: number;
    attendance_corrections?: number;
    payroll_runs?: number;
  };
  payroll?: {
    open_periods?: number;
    pending_runs?: number;
  };
};

export type HrmsNavTab =
  | "overview"
  | "people"
  | "attendance"
  | "leave"
  | "payroll"
  | "onboarding"
  | "helpdesk"
  | "reports"
  | "settings";

export type LeaveRow = {
  id: string;
  person: string;
  person_name?: string;
  policy: string;
  leave_type_name?: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  starts_on: string;
  ends_on: string;
  start_date?: string;
  end_date?: string;
  reason: string;
  days?: number;
  created_at?: string;
};

export type BalanceRow = {
  id: string;
  person: string;
  person_name?: string;
  policy: string;
  year: number;
  allocated_days: number;
  used_days: number;
  remaining_days: number;
};

export type CompanyHolidayRow = {
  id: string;
  name: string;
  holiday_date: string;
  is_half_day?: boolean;
};

