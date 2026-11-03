import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";
import type {
  Activation,
  AttendanceCorrectionRow,
  AttendanceExceptionRow,
  DesignationRow,
  EmployeeDocumentRow,
  Employment,
  HRRequestRow,
  HrmsDashboardOverview,
  LegalEntityRow,
  OffboardingTaskRow,
  OnboardingTaskRow,
  ShiftRow,
  WorkLocationRow,
} from "./types";

const panelClass = "rounded-lg border border-pulse-border bg-pulse-surface p-4";
const labelClass = "text-xs font-medium uppercase tracking-wide text-pulse-muted";

function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : "The request could not be completed.";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type Props = {
  companyId: string;
  permissions: string[];
  activation: Activation | undefined;
  onRefreshActivation: () => void;
};

type HrSubTab =
  | "dashboard"
  | "directory"
  | "lifecycle"
  | "master_data"
  | "attendance_ops"
  | "compliance_docs"
  | "helpdesk"
  | "reports"
  | "activation";

export function HrAdminWorkspace({ companyId, permissions, activation, onRefreshActivation }: Props) {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<HrSubTab>("dashboard");
  const [feedback, setFeedback] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Add Employee Modal State
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newEmpNumber, setNewEmpNumber] = useState("");
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newEmpType, setNewEmpType] = useState("full_time");
  const [newStartsOn, setNewStartsOn] = useState(todayIso());
  const [newLegalEntityId, setNewLegalEntityId] = useState("");

  // Employee Assignment Modals
  const [selectedEmp, setSelectedEmp] = useState<Employment | null>(null);
  const [assignmentModalType, setAssignmentModalType] = useState<
    "status" | "department" | "location" | "schedule" | "manager" | null
  >(null);
  const [assignTargetId, setAssignTargetId] = useState("");
  const [assignStartsOn, setAssignStartsOn] = useState(todayIso());
  const [statusReason, setStatusReason] = useState("");

  // Onboarding/Offboarding Task Modal
  const [showTaskModal, setShowTaskModal] = useState<"onboarding" | "offboarding" | null>(null);
  const [taskEmpId, setTaskEmpId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskCategory, setTaskCategory] = useState("general");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskNotes, setTaskNotes] = useState("");

  // Master Data Modals
  const [showEntityModal, setShowEntityModal] = useState(false);
  const [entityName, setEntityName] = useState("");
  const [entityCode, setEntityCode] = useState("");
  const [entityRegNum, setEntityRegNum] = useState("");
  const [entityCountry, setEntityCountry] = useState("IN");

  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locName, setLocName] = useState("");
  const [locCode, setLocCode] = useState("");
  const [locTimezone, setLocTimezone] = useState("UTC");

  const [showDesignationModal, setShowDesignationModal] = useState(false);
  const [desigName, setDesigName] = useState("");
  const [desigCode, setDesigCode] = useState("");
  const [desigDesc, setDesigDesc] = useState("");

  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftName, setShiftName] = useState("");
  const [shiftCode, setShiftCode] = useState("");
  const [shiftStart, setShiftStart] = useState("09:00:00");
  const [shiftEnd, setShiftEnd] = useState("18:00:00");
  const [shiftGrace, setShiftGrace] = useState(15);

  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState(todayIso());

  // Exception / Doc / Request Modals
  const [activeException, setActiveException] = useState<AttendanceExceptionRow | null>(null);
  const [exceptionAction, setExceptionAction] = useState<"resolved" | "dismissed">("resolved");
  const [exceptionNote, setExceptionNote] = useState("");

  const [activeDocVerify, setActiveDocVerify] = useState<EmployeeDocumentRow | null>(null);
  const [docVerifyStatus, setDocVerifyStatus] = useState<"verified" | "rejected">("verified");
  const [docVerifyNotes, setDocVerifyNotes] = useState("");

  const [activeReqResolve, setActiveReqResolve] = useState<HRRequestRow | null>(null);
  const [reqResolveStatus, setReqResolveStatus] = useState<"in_progress" | "resolved" | "closed">("resolved");
  const [reqResolution, setReqResolution] = useState("");

  // Reports State
  const [reportType, setReportType] = useState<"headcount" | "attendance" | "leaves">("headcount");
  const [reportFrom, setReportFrom] = useState(todayIso());
  const [reportTo, setReportTo] = useState(todayIso());

  const can = (code: string) => permissions.includes(code);
  const root = `/api/v1/companies/${companyId}/hrms`;

  // Queries
  const dashboard = useQuery({
    queryKey: ["hrms-dashboard", companyId],
    queryFn: () => api<HrmsDashboardOverview>(`${root}/dashboard/`),
    enabled: can("hrms.admin.view") || can("hrms.activation.view"),
  });

  const employments = useQuery({
    queryKey: ["hrms-all-employments", companyId],
    queryFn: () => api<{ results: Employment[] }>(`${root}/employments/`),
    enabled: can("hrms.employee.view"),
  });

  const legalEntities = useQuery({
    queryKey: ["hrms-legal-entities", companyId],
    queryFn: () => api<{ results: LegalEntityRow[] }>(`${root}/legal-entities/`),
    enabled: can("hrms.legal_entity.view"),
  });

  const workLocations = useQuery({
    queryKey: ["hrms-work-locations", companyId],
    queryFn: () => api<{ results: WorkLocationRow[] }>(`${root}/work-locations/`),
    enabled: can("hrms.work_location.view"),
  });

  const designations = useQuery({
    queryKey: ["hrms-designations", companyId],
    queryFn: () => api<{ results: DesignationRow[] }>(`${root}/designations/`),
    enabled: can("hrms.employee.view"),
  });

  const shifts = useQuery({
    queryKey: ["hrms-shifts", companyId],
    queryFn: () => api<{ results: ShiftRow[] }>(`${root}/shifts/`),
    enabled: can("hrms.attendance.manage"),
  });

  const holidays = useQuery({
    queryKey: ["hrms-holidays", companyId],
    queryFn: () => api<{ results: Array<{ id: string; name: string; holiday_date: string }> }>(`${root}/holidays/`),
    enabled: can("hrms.attendance.manage"),
  });

  const onboardingTasks = useQuery({
    queryKey: ["hrms-all-onboarding", companyId],
    queryFn: () => api<{ results: OnboardingTaskRow[] }>(`${root}/onboarding-tasks/`),
    enabled: can("hrms.employee.manage"),
  });

  const offboardingTasks = useQuery({
    queryKey: ["hrms-all-offboarding", companyId],
    queryFn: () => api<{ results: OffboardingTaskRow[] }>(`${root}/offboarding-tasks/`),
    enabled: can("hrms.employee.manage"),
  });

  const exceptions = useQuery({
    queryKey: ["hrms-exceptions", companyId],
    queryFn: () => api<{ results: AttendanceExceptionRow[] }>(`${root}/attendance/exceptions/?status=open`),
    enabled: can("hrms.attendance.manage"),
  });

  const corrections = useQuery({
    queryKey: ["hrms-all-corrections", companyId],
    queryFn: () => api<{ results: AttendanceCorrectionRow[] }>(`${root}/attendance/corrections/`),
    enabled: can("hrms.attendance.manage"),
  });

  const allDocuments = useQuery({
    queryKey: ["hrms-all-documents", companyId],
    queryFn: () => api<{ results: EmployeeDocumentRow[] }>(`${root}/documents/`),
    enabled: can("hrms.documents.view"),
  });

  const allRequests = useQuery({
    queryKey: ["hrms-all-requests", companyId],
    queryFn: () => api<{ results: HRRequestRow[] }>(`${root}/requests/`),
    enabled: can("hrms.employee.manage"),
  });

  const reportData = useQuery({
    queryKey: ["hrms-report", companyId, reportType, reportFrom, reportTo],
    queryFn: () =>
      api<{ report_type: string; generated_at: string; rows: Array<Record<string, unknown>> }>(
        `${root}/reports/?report_type=${reportType}&from_date=${reportFrom}&to_date=${reportTo}`
      ),
    enabled: subTab === "reports" && can("hrms.admin.view"),
  });

  // Mutations
  const activateFeature = useMutation({
    mutationFn: (feature: "employee_leave" | "attendance" | "payroll") =>
      api<Activation>(`${root}/activation/`, {
        method: "POST",
        body: JSON.stringify({ feature }),
      }),
    onSuccess: () => {
      setFeedback("Feature activated successfully.");
      onRefreshActivation();
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const createEmployee = useMutation({
    mutationFn: (data: {
      first_name: string;
      last_name: string;
      email?: string;
      employee_number: string;
      job_title: string;
      employment_type: string;
      starts_on: string;
      legal_entity_id?: string;
    }) =>
      api(`${root}/employments/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: async () => {
      setFeedback("Employee created successfully.");
      setShowAddEmpModal(false);
      setNewFirstName("");
      setNewLastName("");
      setNewEmail("");
      setNewEmpNumber("");
      setNewJobTitle("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-all-employments", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-dashboard", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const syncPlatformMembers = useMutation({
    mutationFn: () =>
      api<{ message: string; synced_count: number }>(`${root}/employments/sync/`, {
        method: "POST",
      }),
    onSuccess: async (data) => {
      setFeedback(data?.message || "Platform members synchronized with HRMS.");
      await queryClient.invalidateQueries({ queryKey: ["hrms-all-employments", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-employments-directory", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-dashboard", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const updateEmpStatus = useMutation({
    mutationFn: ({ employmentId, status, reason }: { employmentId: string; status: string; reason: string }) =>
      api(`${root}/employments/${employmentId}/status/`, {
        method: "POST",
        body: JSON.stringify({ status, reason }),
      }),
    onSuccess: async () => {
      setFeedback("Employment status updated.");
      setAssignmentModalType(null);
      setSelectedEmp(null);
      setStatusReason("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-all-employments", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });



  const assignLocation = useMutation({
    mutationFn: ({ employmentId, locationId, startsOn }: { employmentId: string; locationId: string; startsOn: string }) =>
      api(`${root}/employments/${employmentId}/work-location/`, {
        method: "POST",
        body: JSON.stringify({ work_location_id: locationId, starts_on: startsOn }),
      }),
    onSuccess: async () => {
      setFeedback("Work location assignment recorded.");
      setAssignmentModalType(null);
      setSelectedEmp(null);
      await queryClient.invalidateQueries({ queryKey: ["hrms-all-employments", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const assignManager = useMutation({
    mutationFn: ({ employmentId, managerId, startsOn }: { employmentId: string; managerId: string; startsOn: string }) =>
      api(`${root}/reporting-lines/`, {
        method: "POST",
        body: JSON.stringify({
          subordinate_employment_id: employmentId,
          manager_employment_id: managerId,
          starts_on: startsOn,
        }),
      }),
    onSuccess: async () => {
      setFeedback("Reporting manager assigned.");
      setAssignmentModalType(null);
      setSelectedEmp(null);
      await queryClient.invalidateQueries({ queryKey: ["hrms-all-employments", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  // Task Mutations
  const createLifecycleTask = useMutation({
    mutationFn: (data: {
      type: "onboarding" | "offboarding";
      employment_id: string;
      title: string;
      category: string;
      due_date: string | null;
      notes: string;
    }) =>
      api(`${root}/${data.type}-tasks/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: async (_, vars) => {
      setFeedback(`${vars.type === "onboarding" ? "Onboarding" : "Offboarding"} task added.`);
      setShowTaskModal(null);
      setTaskTitle("");
      setTaskNotes("");
      await queryClient.invalidateQueries({ queryKey: [`hrms-all-${vars.type}`, companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const updateTaskStatus = useMutation({
    mutationFn: ({ type, taskId, status }: { type: "onboarding" | "offboarding"; taskId: string; status: string }) =>
      api(`${root}/${type}-tasks/${taskId}/`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: async (_, vars) => {
      setFeedback("Task updated.");
      await queryClient.invalidateQueries({ queryKey: [`hrms-all-${vars.type}`, companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  // Master Data Mutations
  const createLegalEntity = useMutation({
    mutationFn: (data: { name: string; code: string; registration_number: string; country: string }) =>
      api(`${root}/legal-entities/`, {
        method: "POST",
        body: JSON.stringify({ ...data, status: "active" }),
      }),
    onSuccess: async () => {
      setFeedback("Legal Entity created.");
      setShowEntityModal(false);
      setEntityName("");
      setEntityCode("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-legal-entities", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const createWorkLocation = useMutation({
    mutationFn: (data: { name: string; code: string; timezone: string }) =>
      api(`${root}/work-locations/`, {
        method: "POST",
        body: JSON.stringify({ ...data, is_active: true }),
      }),
    onSuccess: async () => {
      setFeedback("Work Location created.");
      setShowLocationModal(false);
      setLocName("");
      setLocCode("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-work-locations", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const createDesignation = useMutation({
    mutationFn: (data: { name: string; code: string; description: string }) =>
      api(`${root}/designations/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: async () => {
      setFeedback("Designation created.");
      setShowDesignationModal(false);
      setDesigName("");
      setDesigCode("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-designations", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const createShift = useMutation({
    mutationFn: (data: { name: string; code: string; start_time: string; end_time: string; grace_period_minutes: number }) =>
      api(`${root}/shifts/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: async () => {
      setFeedback("Shift created.");
      setShowShiftModal(false);
      setShiftName("");
      setShiftCode("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-shifts", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const createHoliday = useMutation({
    mutationFn: (data: { name: string; holiday_date: string }) =>
      api(`${root}/holidays/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: async () => {
      setFeedback("Company Holiday added.");
      setShowHolidayModal(false);
      setHolidayName("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-holidays", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  // Exceptions / Verification / Request Resolution
  const resolveException = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: string; note: string }) =>
      api(`${root}/attendance/exceptions/${id}/resolve/`, {
        method: "POST",
        body: JSON.stringify({ status, resolution_note: note }),
      }),
    onSuccess: async () => {
      setFeedback("Attendance exception resolved.");
      setActiveException(null);
      setExceptionNote("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-exceptions", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-dashboard", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const verifyDocument = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes: string }) =>
      api(`${root}/documents/${id}/verify/`, {
        method: "POST",
        body: JSON.stringify({ status, verification_notes: notes }),
      }),
    onSuccess: async () => {
      setFeedback("Document verification status updated.");
      setActiveDocVerify(null);
      setDocVerifyNotes("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-all-documents", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-dashboard", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const resolveHRRequest = useMutation({
    mutationFn: ({ id, status, resolution }: { id: string; status: string; resolution: string }) =>
      api(`${root}/requests/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ status, resolution }),
      }),
    onSuccess: async () => {
      setFeedback("HR request updated.");
      setActiveReqResolve(null);
      setReqResolution("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-all-requests", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-dashboard", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  // Filtered Employees
  const empList = (employments.data?.results ?? []).filter((e) => {
    const matchesSearch =
      !searchQuery ||
      e.person_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.employee_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.job_title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || e.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const dbData = dashboard.data;

  return (
    <div className="space-y-4">
      {/* Sub-Navigation */}
      <nav className="flex flex-wrap gap-2 border-b border-pulse-border pb-2" aria-label="HR Operations Navigation">
        {(
          [
            { id: "dashboard", label: "HR Dashboard" },
            { id: "directory", label: `Employees (${employments.data?.results.length ?? 0})` },
            { id: "lifecycle", label: "Onboarding & Offboarding" },
            { id: "master_data", label: "Master Data & Setup" },
            { id: "attendance_ops", label: `Attendance Ops (${exceptions.data?.results.length ?? 0})` },
            { id: "compliance_docs", label: "Document Verification" },
            { id: "helpdesk", label: "Helpdesk Tickets" },
            { id: "reports", label: "HR Reports" },
            { id: "activation", label: "Activation Status" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              subTab === item.id
                ? "bg-pulse-accent text-white"
                : "bg-pulse-surface text-pulse-muted hover:bg-pulse-hover hover:text-pulse-ink"
            }`}
            onClick={() => setSubTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {feedback ? (
        <div className="flex items-center justify-between rounded-md bg-pulse-hover px-4 py-2 text-sm text-pulse-ink" role="status">
          <span>{feedback}</span>
          <button type="button" className="text-xs font-semibold text-pulse-muted hover:text-pulse-ink" onClick={() => setFeedback(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Sub-View: HR Dashboard */}
      {subTab === "dashboard" && (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className={panelClass}>
              <p className={labelClass}>Total Headcount</p>
              <p className="mt-2 text-2xl font-bold text-pulse-ink">{dbData?.headcount?.total ?? 0}</p>
              <p className="mt-1 text-xs text-pulse-muted">
                {dbData?.headcount?.active ?? 0} active · {dbData?.headcount?.pending ?? 0} pending setup
              </p>
            </div>
            <div className={panelClass}>
              <p className={labelClass}>Open Onboarding Tasks</p>
              <p className="mt-2 text-2xl font-bold text-pulse-ink">{dbData?.tasks?.open_onboarding ?? 0}</p>
              <p className="mt-1 text-xs text-pulse-muted">{dbData?.tasks?.open_offboarding ?? 0} exit checklists</p>
            </div>
            <div className={panelClass}>
              <p className={labelClass}>Attendance Exceptions</p>
              <p className="mt-2 text-2xl font-bold text-pulse-ink">{dbData?.attendance?.open_exceptions ?? 0}</p>
              <p className="mt-1 text-xs text-pulse-muted">{dbData?.attendance?.pending_corrections ?? 0} corrections pending</p>
            </div>
            <div className={panelClass}>
              <p className={labelClass}>Open HR Requests</p>
              <p className="mt-2 text-2xl font-bold text-pulse-ink">{dbData?.requests?.open_hr_requests ?? 0}</p>
              <p className="mt-1 text-xs text-pulse-muted">{dbData?.documents?.pending_verification ?? 0} docs to verify</p>
            </div>
          </section>

          <section className={panelClass}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pulse-border pb-3">
              <div>
                <h3 className="text-base font-semibold text-pulse-ink">Quick Management Actions</h3>
                <p className="mt-0.5 text-xs text-pulse-muted">Common operational workflows for HR administrators.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={syncPlatformMembers.isPending}
                  onClick={() => syncPlatformMembers.mutate()}
                >
                  {syncPlatformMembers.isPending ? "Syncing..." : "Sync Platform Users"}
                </Button>
                <Button onClick={() => { setSubTab("directory"); setShowAddEmpModal(true); }}>
                  + Add Employee
                </Button>
                <Button variant="secondary" onClick={() => setSubTab("lifecycle")}>
                  Manage Onboarding
                </Button>
                <Button variant="secondary" onClick={() => setSubTab("attendance_ops")}>
                  Review Exceptions
                </Button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
              <div className="rounded-md border border-pulse-border p-3">
                <p className="font-semibold text-pulse-ink">Multi-Entity & Locations</p>
                <p className="mt-1 text-xs text-pulse-muted">
                  LegalEntities: {legalEntities.data?.results.length ?? 0} · Locations: {workLocations.data?.results.length ?? 0}
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-pulse-accent hover:underline"
                  onClick={() => setSubTab("master_data")}
                >
                  Configure Master Data &rarr;
                </button>
              </div>
              <div className="rounded-md border border-pulse-border p-3">
                <p className="font-semibold text-pulse-ink">Compliance Documents</p>
                <p className="mt-1 text-xs text-pulse-muted">
                  {(allDocuments.data?.results ?? []).filter((d) => d.status === "pending").length} pending verification.
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-pulse-accent hover:underline"
                  onClick={() => setSubTab("compliance_docs")}
                >
                  Open Verification Queue &rarr;
                </button>
              </div>
              <div className="rounded-md border border-pulse-border p-3">
                <p className="font-semibold text-pulse-ink">Helpdesk Tickets</p>
                <p className="mt-1 text-xs text-pulse-muted">
                  {(allRequests.data?.results ?? []).filter((r) => r.status === "submitted").length} new employee inquiries.
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-pulse-accent hover:underline"
                  onClick={() => setSubTab("helpdesk")}
                >
                  Open Helpdesk &rarr;
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Sub-View: Employee Directory */}
      {subTab === "directory" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                className="rounded-md border border-pulse-border bg-pulse-surface px-3 py-1.5 text-sm text-pulse-ink"
                placeholder="Search by name, # or title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select
                className="rounded-md border border-pulse-border bg-pulse-surface px-3 py-1.5 text-sm text-pulse-ink"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="draft">Draft</option>
                <option value="on_leave">On Leave</option>
                <option value="suspended">Suspended</option>
                <option value="ended">Ended</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                disabled={syncPlatformMembers.isPending}
                onClick={() => syncPlatformMembers.mutate()}
              >
                {syncPlatformMembers.isPending ? "Syncing..." : "Sync Platform Users"}
              </Button>
              <Button onClick={() => setShowAddEmpModal(true)}>+ Add Employee</Button>
            </div>
          </div>

          {/* Add Employee Modal */}
          {showAddEmpModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-lg rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-pulse-ink">Create Employee Record</h3>
                <p className="mt-1 text-xs text-pulse-muted">
                  Record an employee profile. Login accounts are not required to create Employment records.
                </p>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createEmployee.mutate({
                      first_name: newFirstName,
                      last_name: newLastName,
                      email: newEmail || undefined,
                      employee_number: newEmpNumber,
                      job_title: newJobTitle,
                      employment_type: newEmpType,
                      starts_on: newStartsOn,
                      legal_entity_id: newLegalEntityId || undefined,
                    });
                  }}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-medium text-pulse-ink">
                      First Name
                      <input
                        required
                        className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                        value={newFirstName}
                        onChange={(e) => setNewFirstName(e.target.value)}
                      />
                    </label>
                    <label className="block text-sm font-medium text-pulse-ink">
                      Last Name
                      <input
                        required
                        className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                        value={newLastName}
                        onChange={(e) => setNewLastName(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Email (Optional - links to existing Person if matched)
                    <input
                      type="email"
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="e.g. employee@company.com"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-medium text-pulse-ink">
                      Employee Number
                      <input
                        required
                        className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                        value={newEmpNumber}
                        onChange={(e) => setNewEmpNumber(e.target.value)}
                        placeholder="EMP-001"
                      />
                    </label>
                    <label className="block text-sm font-medium text-pulse-ink">
                      Job Title
                      <input
                        required
                        className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                        value={newJobTitle}
                        onChange={(e) => setNewJobTitle(e.target.value)}
                        placeholder="Software Engineer"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-medium text-pulse-ink">
                      Employment Type
                      <select
                        className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                        value={newEmpType}
                        onChange={(e) => setNewEmpType(e.target.value)}
                      >
                        <option value="full_time">Full Time</option>
                        <option value="part_time">Part Time</option>
                        <option value="contractor">Contractor</option>
                        <option value="intern">Intern</option>
                      </select>
                    </label>
                    <label className="block text-sm font-medium text-pulse-ink">
                      Starts On
                      <input
                        type="date"
                        required
                        className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                        value={newStartsOn}
                        onChange={(e) => setNewStartsOn(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Legal Entity (Required for active employment)
                    <select
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={newLegalEntityId}
                      onChange={(e) => setNewLegalEntityId(e.target.value)}
                    >
                      <option value="">Select Legal Entity</option>
                      {(legalEntities.data?.results ?? []).map((le) => (
                        <option key={le.id} value={le.id}>
                          {le.name} ({le.code})
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setShowAddEmpModal(false)}>
                      Cancel
                    </Button>
                    <Button disabled={createEmployee.isPending} type="submit">
                      Create Employment
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Directory Table */}
          <section className={panelClass}>
            {employments.isLoading ? (
              <LoadingState label="Loading directory" />
            ) : empList.length === 0 ? (
              <EmptyState title="No employees match" body="Try clearing search filters or add a new employee." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[50rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-pulse-border text-pulse-muted">
                      <th className="py-2.5 pr-3 font-medium">Employee #</th>
                      <th className="py-2.5 pr-3 font-medium">Name</th>
                      <th className="py-2.5 pr-3 font-medium">Job Title</th>
                      <th className="py-2.5 pr-3 font-medium">Department</th>
                      <th className="py-2.5 pr-3 font-medium">Location</th>
                      <th className="py-2.5 pr-3 font-medium">Entity</th>
                      <th className="py-2.5 pr-3 font-medium">Status</th>
                      <th className="py-2.5 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empList.map((emp) => (
                      <tr key={emp.id} className="border-b border-pulse-border/60">
                        <td className="py-2.5 pr-3 font-semibold text-pulse-ink">{emp.employee_number || emp.id.slice(0, 8)}</td>
                        <td className="py-2.5 pr-3 font-medium text-pulse-ink">{emp.person_name}</td>
                        <td className="py-2.5 pr-3 text-pulse-muted">{emp.job_title || "-"}</td>
                        <td className="py-2.5 pr-3 text-pulse-muted">{emp.department_name || "-"}</td>
                        <td className="py-2.5 pr-3 text-pulse-muted">{emp.work_location_name || "-"}</td>
                        <td className="py-2.5 pr-3 text-pulse-muted">{emp.legal_entity_name || "Pending"}</td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${
                              emp.status === "active"
                                ? "bg-green-100 text-green-800"
                                : emp.status === "probation"
                                ? "bg-blue-100 text-blue-800"
                                : emp.status === "terminated"
                                ? "bg-red-100 text-red-800"
                                : "bg-pulse-hover text-pulse-ink"
                            }`}
                          >
                            {emp.status}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              className="rounded border border-pulse-border px-2 py-1 text-xs font-medium text-pulse-ink hover:bg-pulse-hover"
                              onClick={() => {
                                setSelectedEmp(emp);
                                setAssignmentModalType("status");
                              }}
                            >
                              Status
                            </button>
                            <button
                              type="button"
                              className="rounded border border-pulse-border px-2 py-1 text-xs font-medium text-pulse-ink hover:bg-pulse-hover"
                              onClick={() => {
                                setSelectedEmp(emp);
                                setAssignmentModalType("location");
                              }}
                            >
                              Location
                            </button>
                            <button
                              type="button"
                              className="rounded border border-pulse-border px-2 py-1 text-xs font-medium text-pulse-ink hover:bg-pulse-hover"
                              onClick={() => {
                                setSelectedEmp(emp);
                                setAssignmentModalType("manager");
                              }}
                            >
                              Manager
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Assignment / Status Transition Modal */}
          {assignmentModalType && selectedEmp && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-pulse-ink">
                  {assignmentModalType === "status"
                    ? `Update Status for ${selectedEmp.person_name}`
                    : assignmentModalType === "location"
                    ? `Assign Work Location for ${selectedEmp.person_name}`
                    : `Assign Reporting Manager for ${selectedEmp.person_name}`}
                </h3>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (assignmentModalType === "status") {
                      updateEmpStatus.mutate({
                        employmentId: selectedEmp.id,
                        status: assignTargetId || "active",
                        reason: statusReason,
                      });
                    } else if (assignmentModalType === "location") {
                      assignLocation.mutate({
                        employmentId: selectedEmp.id,
                        locationId: assignTargetId,
                        startsOn: assignStartsOn,
                      });
                    } else if (assignmentModalType === "manager") {
                      assignManager.mutate({
                        employmentId: selectedEmp.id,
                        managerId: assignTargetId,
                        startsOn: assignStartsOn,
                      });
                    }
                  }}
                >
                  {assignmentModalType === "status" ? (
                    <>
                      <label className="block text-sm font-medium text-pulse-ink">
                        New Status
                        <select
                          required
                          className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                          value={assignTargetId}
                          onChange={(e) => setAssignTargetId(e.target.value)}
                        >
                          <option value="">Select Status</option>
                          <option value="active">Active</option>
                          <option value="probation">Probation</option>
                          <option value="suspended">Suspended</option>
                          <option value="terminated">Terminated</option>
                        </select>
                      </label>
                      <label className="block text-sm font-medium text-pulse-ink">
                        Reason for Change
                        <textarea
                          rows={2}
                          className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                          value={statusReason}
                          onChange={(e) => setStatusReason(e.target.value)}
                          placeholder="e.g. Probation completed / voluntary resignation"
                        />
                      </label>
                    </>
                  ) : assignmentModalType === "location" ? (
                    <>
                      <label className="block text-sm font-medium text-pulse-ink">
                        Work Location
                        <select
                          required
                          className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                          value={assignTargetId}
                          onChange={(e) => setAssignTargetId(e.target.value)}
                        >
                          <option value="">Select Location</option>
                          {(workLocations.data?.results ?? []).map((loc) => (
                            <option key={loc.id} value={loc.id}>
                              {loc.name} ({loc.timezone})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm font-medium text-pulse-ink">
                        Effective Starts On
                        <input
                          type="date"
                          required
                          className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                          value={assignStartsOn}
                          onChange={(e) => setAssignStartsOn(e.target.value)}
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="block text-sm font-medium text-pulse-ink">
                        Reporting Manager
                        <select
                          required
                          className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                          value={assignTargetId}
                          onChange={(e) => setAssignTargetId(e.target.value)}
                        >
                          <option value="">Select Manager</option>
                          {(employments.data?.results ?? [])
                            .filter((e) => e.id !== selectedEmp.id)
                            .map((mgr) => (
                              <option key={mgr.id} value={mgr.id}>
                                {mgr.person_name} ({mgr.job_title || mgr.employee_number})
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="block text-sm font-medium text-pulse-ink">
                        Effective Starts On
                        <input
                          type="date"
                          required
                          className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                          value={assignStartsOn}
                          onChange={(e) => setAssignStartsOn(e.target.value)}
                        />
                      </label>
                    </>
                  )}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setAssignmentModalType(null);
                        setSelectedEmp(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={updateEmpStatus.isPending || assignLocation.isPending || assignManager.isPending}
                      type="submit"
                    >
                      Save Assignment
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-View: Lifecycle & Tasks */}
      {subTab === "lifecycle" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-pulse-ink">Lifecycle Checklists</h2>
              <p className="mt-1 text-xs text-pulse-muted">
                Track onboarding task completion and offboarding asset/clearance workflows.
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowTaskModal("onboarding")}>+ Add Onboarding Task</Button>
              <Button variant="secondary" onClick={() => setShowTaskModal("offboarding")}>
                + Add Offboarding Task
              </Button>
            </div>
          </div>

          {/* Task Modal */}
          {showTaskModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-pulse-ink">
                  Add {showTaskModal === "onboarding" ? "Onboarding" : "Offboarding"} Task
                </h3>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createLifecycleTask.mutate({
                      type: showTaskModal,
                      employment_id: taskEmpId,
                      title: taskTitle,
                      category: taskCategory,
                      due_date: taskDueDate || null,
                      notes: taskNotes,
                    });
                  }}
                >
                  <label className="block text-sm font-medium text-pulse-ink">
                    Employee
                    <select
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={taskEmpId}
                      onChange={(e) => setTaskEmpId(e.target.value)}
                    >
                      <option value="">Select Employee</option>
                      {(employments.data?.results ?? []).map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.person_name} ({emp.employee_number})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Task Title
                    <input
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder="e.g. Provide laptop / sign NDA"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-medium text-pulse-ink">
                      Category
                      <select
                        className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                        value={taskCategory}
                        onChange={(e) => setTaskCategory(e.target.value)}
                      >
                        {showTaskModal === "onboarding" ? (
                          <>
                            <option value="document">Document Collection</option>
                            <option value="it_setup">IT Equipment & Access</option>
                            <option value="orientation">Orientation</option>
                            <option value="policy">Policy Acknowledgment</option>
                            <option value="general">General</option>
                          </>
                        ) : (
                          <>
                            <option value="asset_return">Asset Return</option>
                            <option value="access_revocation">Access Revocation</option>
                            <option value="exit_interview">Exit Interview</option>
                            <option value="finance_clearance">Finance Clearance</option>
                            <option value="general">General</option>
                          </>
                        )}
                      </select>
                    </label>
                    <label className="block text-sm font-medium text-pulse-ink">
                      Due Date
                      <input
                        type="date"
                        className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                        value={taskDueDate}
                        onChange={(e) => setTaskDueDate(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Notes / Instructions
                    <textarea
                      rows={2}
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={taskNotes}
                      onChange={(e) => setTaskNotes(e.target.value)}
                    />
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setShowTaskModal(null)}>
                      Cancel
                    </Button>
                    <Button disabled={createLifecycleTask.isPending} type="submit">
                      Create Task
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Onboarding Tasks Table */}
          <section className={panelClass}>
            <h3 className="text-sm font-semibold text-pulse-ink">
              Onboarding Tasks ({onboardingTasks.data?.results.length ?? 0})
            </h3>
            {(onboardingTasks.data?.results.length ?? 0) === 0 ? (
              <p className="mt-2 text-xs text-pulse-muted">No onboarding tasks currently assigned.</p>
            ) : (
              <div className="mt-3 divide-y divide-pulse-border">
                {onboardingTasks.data?.results.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                    <div>
                      <p className="font-semibold text-pulse-ink">
                        {t.title} · <span className="font-normal text-pulse-muted">{t.employee_name}</span>
                      </p>
                      <p className="text-xs text-pulse-muted">
                        Category: {t.category} {t.due_date ? `· Due: ${t.due_date}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-pulse-hover px-2 py-0.5 text-xs font-medium uppercase text-pulse-muted">
                        {t.status}
                      </span>
                      {t.status !== "completed" ? (
                        <Button
                          disabled={updateTaskStatus.isPending}
                          onClick={() => updateTaskStatus.mutate({ type: "onboarding", taskId: t.id, status: "completed" })}
                        >
                          Mark Completed
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Offboarding Tasks Table */}
          <section className={panelClass}>
            <h3 className="text-sm font-semibold text-pulse-ink">
              Offboarding & Asset Return Checklists ({offboardingTasks.data?.results.length ?? 0})
            </h3>
            {(offboardingTasks.data?.results.length ?? 0) === 0 ? (
              <p className="mt-2 text-xs text-pulse-muted">No offboarding exit checklists.</p>
            ) : (
              <div className="mt-3 divide-y divide-pulse-border">
                {offboardingTasks.data?.results.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                    <div>
                      <p className="font-semibold text-pulse-ink">
                        {t.title} · <span className="font-normal text-pulse-muted">{t.employee_name}</span>
                      </p>
                      <p className="text-xs text-pulse-muted">Category: {t.category}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-pulse-hover px-2 py-0.5 text-xs font-medium uppercase text-pulse-muted">
                        {t.status}
                      </span>
                      {t.status !== "completed" ? (
                        <Button
                          disabled={updateTaskStatus.isPending}
                          onClick={() => updateTaskStatus.mutate({ type: "offboarding", taskId: t.id, status: "completed" })}
                        >
                          Clear Item
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Sub-View: Master Data */}
      {subTab === "master_data" && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Legal Entities */}
            <section className={panelClass}>
              <div className="flex items-center justify-between border-b border-pulse-border pb-2">
                <h3 className="text-sm font-semibold text-pulse-ink">Legal Entities</h3>
                <Button variant="secondary" onClick={() => setShowEntityModal(true)}>+ Add Entity</Button>
              </div>
              <ul className="mt-3 divide-y divide-pulse-border text-sm">
                {(legalEntities.data?.results ?? []).map((le) => (
                  <li key={le.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-medium text-pulse-ink">{le.name}</p>
                      <p className="text-xs text-pulse-muted">Code: {le.code} · Country: {le.country}</p>
                    </div>
                    <span className="rounded bg-pulse-hover px-2 py-0.5 text-xs text-pulse-muted">{le.status}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Work Locations */}
            <section className={panelClass}>
              <div className="flex items-center justify-between border-b border-pulse-border pb-2">
                <h3 className="text-sm font-semibold text-pulse-ink">Work Locations</h3>
                <Button variant="secondary" onClick={() => setShowLocationModal(true)}>+ Add Location</Button>
              </div>
              <ul className="mt-3 divide-y divide-pulse-border text-sm">
                {(workLocations.data?.results ?? []).map((loc) => (
                  <li key={loc.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-medium text-pulse-ink">{loc.name}</p>
                      <p className="text-xs text-pulse-muted">Code: {loc.code} · TZ: {loc.timezone}</p>
                    </div>
                    <span className="rounded bg-pulse-hover px-2 py-0.5 text-xs text-pulse-muted">
                      {loc.is_active ? "Active" : "Inactive"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Designations */}
            <section className={panelClass}>
              <div className="flex items-center justify-between border-b border-pulse-border pb-2">
                <h3 className="text-sm font-semibold text-pulse-ink">Designations & Job Titles</h3>
                <Button variant="secondary" onClick={() => setShowDesignationModal(true)}>+ Add Designation</Button>
              </div>
              <ul className="mt-3 divide-y divide-pulse-border text-sm">
                {(designations.data?.results ?? []).map((desig) => (
                  <li key={desig.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-medium text-pulse-ink">{desig.name}</p>
                      <p className="text-xs text-pulse-muted">Code: {desig.code}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* Shifts */}
            <section className={panelClass}>
              <div className="flex items-center justify-between border-b border-pulse-border pb-2">
                <h3 className="text-sm font-semibold text-pulse-ink">Attendance Shifts</h3>
                <Button variant="secondary" onClick={() => setShowShiftModal(true)}>+ Add Shift</Button>
              </div>
              <ul className="mt-3 divide-y divide-pulse-border text-sm">
                {(shifts.data?.results ?? []).map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-medium text-pulse-ink">{s.name}</p>
                      <p className="text-xs text-pulse-muted">{s.start_time} - {s.end_time} ({s.grace_period_minutes}m grace)</p>
                    </div>
                    <span className="rounded bg-pulse-hover px-2 py-0.5 text-xs text-pulse-muted">{s.code}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Holidays */}
            <section className={panelClass}>
              <div className="flex items-center justify-between border-b border-pulse-border pb-2">
                <h3 className="text-sm font-semibold text-pulse-ink">Company Holidays</h3>
                <Button variant="secondary" onClick={() => setShowHolidayModal(true)}>+ Add Holiday</Button>
              </div>
              <ul className="mt-3 divide-y divide-pulse-border text-sm">
                {(holidays.data?.results ?? []).map((h) => (
                  <li key={h.id} className="flex items-center justify-between py-2">
                    <span className="font-medium text-pulse-ink">{h.name}</span>
                    <span className="text-xs text-pulse-muted">{h.holiday_date}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Master Data Creation Modals */}
          {showEntityModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-pulse-ink">New Legal Entity</h3>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createLegalEntity.mutate({
                      name: entityName,
                      code: entityCode,
                      registration_number: entityRegNum,
                      country: entityCountry,
                    });
                  }}
                >
                  <label className="block text-sm font-medium text-pulse-ink">
                    Entity Name
                    <input
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={entityName}
                      onChange={(e) => setEntityName(e.target.value)}
                    />
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Entity Code (Slug)
                    <input
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={entityCode}
                      onChange={(e) => setEntityCode(e.target.value)}
                      placeholder="e.g. acme-india-ltd"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-medium text-pulse-ink">
                      Reg Number
                      <input
                        className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                        value={entityRegNum}
                        onChange={(e) => setEntityRegNum(e.target.value)}
                      />
                    </label>
                    <label className="block text-sm font-medium text-pulse-ink">
                      Country Code
                      <input
                        required
                        className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                        value={entityCountry}
                        onChange={(e) => setEntityCountry(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setShowEntityModal(false)}>Cancel</Button>
                    <Button disabled={createLegalEntity.isPending} type="submit">Create</Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {showLocationModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-pulse-ink">New Work Location</h3>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createWorkLocation.mutate({
                      name: locName,
                      code: locCode,
                      timezone: locTimezone,
                    });
                  }}
                >
                  <label className="block text-sm font-medium text-pulse-ink">
                    Location Name
                    <input
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={locName}
                      onChange={(e) => setLocName(e.target.value)}
                    />
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Code
                    <input
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={locCode}
                      onChange={(e) => setLocCode(e.target.value)}
                    />
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Timezone
                    <input
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={locTimezone}
                      onChange={(e) => setLocTimezone(e.target.value)}
                      placeholder="e.g. Asia/Kolkata, UTC"
                    />
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setShowLocationModal(false)}>Cancel</Button>
                    <Button disabled={createWorkLocation.isPending} type="submit">Create</Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {showDesignationModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-pulse-ink">New Designation</h3>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createDesignation.mutate({
                      name: desigName,
                      code: desigCode,
                      description: desigDesc,
                    });
                  }}
                >
                  <label className="block text-sm font-medium text-pulse-ink">
                    Designation Name
                    <input
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={desigName}
                      onChange={(e) => setDesigName(e.target.value)}
                    />
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Code
                    <input
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={desigCode}
                      onChange={(e) => setDesigCode(e.target.value)}
                    />
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Description
                    <textarea
                      rows={2}
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={desigDesc}
                      onChange={(e) => setDesigDesc(e.target.value)}
                    />
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setShowDesignationModal(false)}>Cancel</Button>
                    <Button disabled={createDesignation.isPending} type="submit">Create</Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {showShiftModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-pulse-ink">New Shift</h3>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createShift.mutate({
                      name: shiftName,
                      code: shiftCode,
                      start_time: shiftStart,
                      end_time: shiftEnd,
                      grace_period_minutes: Number(shiftGrace),
                    });
                  }}
                >
                  <label className="block text-sm font-medium text-pulse-ink">
                    Shift Name
                    <input
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={shiftName}
                      onChange={(e) => setShiftName(e.target.value)}
                    />
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Code
                    <input
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={shiftCode}
                      onChange={(e) => setShiftCode(e.target.value)}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-medium text-pulse-ink">
                      Start Time
                      <input
                        type="time"
                        step="1"
                        required
                        className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                        value={shiftStart}
                        onChange={(e) => setShiftStart(e.target.value)}
                      />
                    </label>
                    <label className="block text-sm font-medium text-pulse-ink">
                      End Time
                      <input
                        type="time"
                        step="1"
                        required
                        className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                        value={shiftEnd}
                        onChange={(e) => setShiftEnd(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Grace Period (minutes)
                    <input
                      type="number"
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={shiftGrace}
                      onChange={(e) => setShiftGrace(Number(e.target.value))}
                    />
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setShowShiftModal(false)}>Cancel</Button>
                    <Button disabled={createShift.isPending} type="submit">Create</Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {showHolidayModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-pulse-ink">Add Company Holiday</h3>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createHoliday.mutate({
                      name: holidayName,
                      holiday_date: holidayDate,
                    });
                  }}
                >
                  <label className="block text-sm font-medium text-pulse-ink">
                    Holiday Name
                    <input
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={holidayName}
                      onChange={(e) => setHolidayName(e.target.value)}
                      placeholder="e.g. New Year's Day"
                    />
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Holiday Date
                    <input
                      type="date"
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={holidayDate}
                      onChange={(e) => setHolidayDate(e.target.value)}
                    />
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setShowHolidayModal(false)}>Cancel</Button>
                    <Button disabled={createHoliday.isPending} type="submit">Create Holiday</Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-View: Attendance Ops */}
      {subTab === "attendance_ops" && (
        <div className="space-y-4">
          <section className={panelClass}>
            <h3 className="text-sm font-semibold text-pulse-ink">
              Open Attendance Exceptions ({exceptions.data?.results.length ?? 0})
            </h3>
            <p className="mt-0.5 text-xs text-pulse-muted">
              Unresolved punches, missed checkouts, or geofence verification failures.
            </p>
            {(exceptions.data?.results.length ?? 0) === 0 ? (
              <p className="mt-3 text-xs text-pulse-muted">No open attendance exceptions.</p>
            ) : (
              <div className="mt-3 divide-y divide-pulse-border">
                {exceptions.data?.results.map((ex) => (
                  <div key={ex.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                    <div>
                      <p className="font-semibold text-pulse-ink">
                        {ex.employee_name} · <span className="text-pulse-accent">{ex.exception_type}</span>
                      </p>
                      <p className="text-xs text-pulse-muted">Created: {new Date(ex.created_at).toLocaleString()}</p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => setActiveException(ex)}
                    >
                      Resolve Exception
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={panelClass}>
            <h3 className="text-sm font-semibold text-pulse-ink">
              Recent Attendance Correction Requests ({corrections.data?.results.length ?? 0})
            </h3>
            <div className="mt-3 divide-y divide-pulse-border text-sm">
              {(corrections.data?.results ?? []).map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-medium text-pulse-ink">{c.employee_name} · {c.reason}</p>
                    <p className="text-xs text-pulse-muted">Status: {c.status} · Requested: {new Date(c.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className="rounded bg-pulse-hover px-2 py-0.5 text-xs uppercase text-pulse-muted">{c.status}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Exception Resolve Modal */}
          {activeException && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-pulse-ink">
                  Resolve Exception · {activeException.employee_name}
                </h3>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    resolveException.mutate({
                      id: activeException.id,
                      status: exceptionAction,
                      note: exceptionNote,
                    });
                  }}
                >
                  <label className="block text-sm font-medium text-pulse-ink">
                    Resolution Status
                    <select
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={exceptionAction}
                      onChange={(e) => setExceptionAction(e.target.value as "resolved" | "dismissed")}
                    >
                      <option value="resolved">Resolved (Approved Correction / Adjusted)</option>
                      <option value="dismissed">Dismissed (No Adjustment)</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Resolution Notes
                    <textarea
                      required
                      rows={3}
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={exceptionNote}
                      onChange={(e) => setExceptionNote(e.target.value)}
                      placeholder="e.g. Validated manual time entry with line manager."
                    />
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setActiveException(null)}>Cancel</Button>
                    <Button disabled={resolveException.isPending} type="submit">Save Resolution</Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-View: Compliance & Documents */}
      {subTab === "compliance_docs" && (
        <div className="space-y-4">
          <section className={panelClass}>
            <h3 className="text-sm font-semibold text-pulse-ink">
              Employee Documents Queue ({allDocuments.data?.results.length ?? 0})
            </h3>
            <p className="mt-0.5 text-xs text-pulse-muted">
              Verify identity, tax, and employment compliance documents.
            </p>
            {(allDocuments.data?.results.length ?? 0) === 0 ? (
              <EmptyState title="No documents found" body="Employee documents will appear here for verification." />
            ) : (
              <div className="mt-3 divide-y divide-pulse-border">
                {allDocuments.data?.results.map((doc) => (
                  <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-pulse-ink">
                        {doc.title} · <span className="font-normal text-pulse-muted">{doc.employee_name}</span>
                      </p>
                      <p className="text-xs text-pulse-muted">
                        Category: {doc.category} {doc.is_sensitive ? " · [Sensitive Record]" : ""} · Uploaded:{" "}
                        {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                      {doc.verification_notes ? (
                        <p className="mt-1 text-xs text-pulse-accent">Notes: {doc.verification_notes}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${
                          doc.status === "verified"
                            ? "bg-green-100 text-green-800"
                            : doc.status === "rejected"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {doc.status}
                      </span>
                      {doc.status === "pending" ? (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setActiveDocVerify(doc);
                            setDocVerifyStatus("verified");
                          }}
                        >
                          Verify Document
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Doc Verification Modal */}
          {activeDocVerify && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-pulse-ink">
                  Verify Document · {activeDocVerify.title}
                </h3>
                <p className="mt-1 text-xs text-pulse-muted">Submitted by {activeDocVerify.employee_name}</p>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    verifyDocument.mutate({
                      id: activeDocVerify.id,
                      status: docVerifyStatus,
                      notes: docVerifyNotes,
                    });
                  }}
                >
                  <label className="block text-sm font-medium text-pulse-ink">
                    Verification Decision
                    <select
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={docVerifyStatus}
                      onChange={(e) => setDocVerifyStatus(e.target.value as "verified" | "rejected")}
                    >
                      <option value="verified">Verified & Approved</option>
                      <option value="rejected">Rejected (Needs resubmission)</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Review Remarks
                    <textarea
                      rows={2}
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={docVerifyNotes}
                      onChange={(e) => setDocVerifyNotes(e.target.value)}
                    />
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setActiveDocVerify(null)}>Cancel</Button>
                    <Button disabled={verifyDocument.isPending} type="submit">Submit Verification</Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-View: Helpdesk */}
      {subTab === "helpdesk" && (
        <div className="space-y-4">
          <section className={panelClass}>
            <h3 className="text-sm font-semibold text-pulse-ink">
              Company HR Helpdesk Tickets ({allRequests.data?.results.length ?? 0})
            </h3>
            {(allRequests.data?.results.length ?? 0) === 0 ? (
              <EmptyState title="No helpdesk requests" body="Employee requests will show up here." />
            ) : (
              <div className="mt-3 divide-y divide-pulse-border">
                {allRequests.data?.results.map((req) => (
                  <div key={req.id} className="py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-pulse-ink">{req.subject}</span> ·{" "}
                        <span className="text-pulse-muted">{req.employee_name}</span>
                        <span className="ml-2 rounded bg-pulse-hover px-1.5 py-0.5 text-xs uppercase text-pulse-muted">
                          {req.priority}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${
                            req.status === "resolved"
                              ? "bg-green-100 text-green-800"
                              : req.status === "in_progress"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {req.status}
                        </span>
                        <Button variant="secondary" onClick={() => setActiveReqResolve(req)}>
                          Update / Resolve
                        </Button>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-pulse-muted">
                      Category: {req.category} · Created: {new Date(req.created_at).toLocaleDateString()}
                    </p>
                    <p className="mt-2 text-sm text-pulse-ink">{req.description}</p>
                    {req.resolution ? (
                      <div className="mt-2 rounded bg-pulse-hover p-2.5 text-xs text-pulse-ink">
                        <span className="font-semibold text-pulse-accent">Resolution: </span>
                        {req.resolution}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Helpdesk Resolve Modal */}
          {activeReqResolve && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-pulse-ink">
                  Update Ticket · {activeReqResolve.subject}
                </h3>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    resolveHRRequest.mutate({
                      id: activeReqResolve.id,
                      status: reqResolveStatus,
                      resolution: reqResolution,
                    });
                  }}
                >
                  <label className="block text-sm font-medium text-pulse-ink">
                    Status
                    <select
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={reqResolveStatus}
                      onChange={(e) => setReqResolveStatus(e.target.value as "in_progress" | "resolved" | "closed")}
                    >
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Resolution Notes
                    <textarea
                      required
                      rows={3}
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={reqResolution}
                      onChange={(e) => setReqResolution(e.target.value)}
                      placeholder="Explain action taken or answer provided..."
                    />
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setActiveReqResolve(null)}>Cancel</Button>
                    <Button disabled={resolveHRRequest.isPending} type="submit">Save</Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-View: Reports */}
      {subTab === "reports" && (
        <div className="space-y-4">
          <section className={panelClass}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pulse-border pb-3">
              <div>
                <h3 className="text-base font-semibold text-pulse-ink">HR Reports & Analytics</h3>
                <p className="mt-0.5 text-xs text-pulse-muted">
                  Generate tenant-isolated operational snapshots.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="rounded-md border border-pulse-border bg-pulse-surface px-3 py-1.5 text-sm text-pulse-ink"
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as "headcount" | "attendance" | "leaves")}
                >
                  <option value="headcount">Headcount & Distribution</option>
                  <option value="attendance">Attendance Summary</option>
                  <option value="leaves">Leave Utilization</option>
                </select>
                <input
                  type="date"
                  className="rounded-md border border-pulse-border bg-pulse-surface px-2 py-1.5 text-sm text-pulse-ink"
                  value={reportFrom}
                  onChange={(e) => setReportFrom(e.target.value)}
                />
                <input
                  type="date"
                  className="rounded-md border border-pulse-border bg-pulse-surface px-2 py-1.5 text-sm text-pulse-ink"
                  value={reportTo}
                  onChange={(e) => setReportTo(e.target.value)}
                />
              </div>
            </div>

            {reportData.isLoading ? (
              <LoadingState label="Compiling report data" />
            ) : reportData.isError ? (
              <ErrorState title="Report error" body={errorText(reportData.error)} />
            ) : (reportData.data?.rows.length ?? 0) === 0 ? (
              <EmptyState title="No records in period" body="No operational data found for the selected dates." />
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-pulse-border text-pulse-muted">
                      {Object.keys(reportData.data?.rows[0] ?? {}).map((col) => (
                        <th key={col} className="py-2 pr-3 font-medium capitalize">
                          {col.replace(/_/g, " ")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.data?.rows.map((row, idx) => (
                      <tr key={idx} className="border-b border-pulse-border/60">
                        {Object.values(row).map((val, cIdx) => (
                          <td key={cIdx} className="py-2 pr-3 text-pulse-ink">
                            {String(val ?? "-")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Sub-View: Activation Status */}
      {subTab === "activation" && (
        <div className="space-y-4">
          {activation ? (
            <section className={panelClass}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-pulse-border pb-3">
                <div>
                  <h3 className="text-base font-semibold text-pulse-ink">Module Readiness & Activation Gates</h3>
                  <p className="mt-1 text-xs text-pulse-muted">
                    Pulse enforces independent readiness gates before operational access is unlocked.
                  </p>
                </div>
                <span className="rounded bg-pulse-hover px-2 py-1 text-xs font-medium capitalize text-pulse-ink">
                  {activation.status}
                </span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {(["employee_leave", "attendance", "payroll"] as const).map((feat) => {
                  const gate = activation?.readiness?.[feat];
                  if (!gate) return null;
                  return (
                    <div key={feat} className="rounded-md border border-pulse-border p-3.5">
                      <p className="font-semibold text-pulse-ink">
                        {feat === "employee_leave" ? "Employee & Leave" : feat === "attendance" ? "Attendance" : "Payroll"}
                      </p>
                      <p className="mt-1 text-xs text-pulse-muted">
                        {gate.activated
                          ? "Activated and operational."
                          : gate.ready
                          ? "Ready to activate."
                          : gate.reason || gate.reasons?.join(" ") || "Setup requirements pending."}
                      </p>
                      {gate.ready && !gate.activated ? (
                        <Button
                          className="mt-3"
                          disabled={activateFeature.isPending}
                          onClick={() => activateFeature.mutate(feat)}
                        >
                          Activate Now
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
