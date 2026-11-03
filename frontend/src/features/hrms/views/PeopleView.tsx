import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError } from "../../../shared/api/client";
import { Button } from "../../../shared/ui/Button";
import { EmptyState } from "../../../shared/ui/States";
import type {
  EligiblePerson,
  Employment,
  LegalEntityRow,
  TeamMember,
  WorkLocationRow,
} from "../types";

const panelClass = "rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-sm";
const labelClass = "text-xs font-semibold uppercase tracking-wider text-pulse-muted";

function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : "The request could not be completed.";
}

interface PeopleViewProps {
  companyId: string;
  permissions: string[];
  employments: Employment[];
  onRefreshEmployments: () => void;
  showAddModalInitial?: boolean;
  onCloseAddModal?: () => void;
}

type WizardStep = "select_person" | "create_person" | "employment" | "review";

export function PeopleView({
  companyId,
  permissions,
  employments,
  onRefreshEmployments,
  showAddModalInitial,
  onCloseAddModal,
}: PeopleViewProps) {
  const queryClient = useQueryClient();
  const can = (code: string) => permissions.includes(code);
  const root = `/api/v1/companies/${companyId}/hrms`;

  const canManage = can("hrms.employee.manage");
  const isManager = can("hrms.manager.view");

  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [viewScope, setViewScope] = useState<"all" | "team">(canManage ? "all" : isManager ? "team" : "all");

  // Feedback banner
  const [feedback, setFeedback] = useState<string | null>(null);

  // Selected Employment for Detail Slide-over
  const [selectedEmp, setSelectedEmp] = useState<Employment | null>(null);

  // Add Employee Wizard Modal State
  const [showAddEmpModal, setShowAddEmpModal] = useState(Boolean(showAddModalInitial));
  const [wizardStep, setWizardStep] = useState<WizardStep>("select_person");
  const [personSearch, setPersonSearch] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<EligiblePerson | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Inline Person Creation Form
  const [inlineFirstName, setInlineFirstName] = useState("");
  const [inlineLastName, setInlineLastName] = useState("");
  const [inlineEmail, setInlineEmail] = useState("");
  const [inlineJobTitle, setInlineJobTitle] = useState("");
  const [inlineDeptId, setInlineDeptId] = useState("");

  // Employment Form State
  const [newEmpNumber, setNewEmpNumber] = useState("");
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newEmpType, setNewEmpType] = useState("full_time");
  const [newStartsOn, setNewStartsOn] = useState(new Date().toISOString().slice(0, 10));
  const [newLegalEntityId, setNewLegalEntityId] = useState("");
  const [newDeptId, setNewDeptId] = useState("");
  const [newLocationId, setNewLocationId] = useState("");
  const [newManagerId, setNewManagerId] = useState("");
  const [newStatus, setNewStatus] = useState("active");

  // Status Change Modal
  const [statusTargetEmp, setStatusTargetEmp] = useState<Employment | null>(null);
  const [targetStatus, setTargetStatus] = useState("active");
  const [statusReason, setStatusReason] = useState("");

  // Manager Assignment Modal
  const [showAssignManagerModal, setShowAssignManagerModal] = useState(false);
  const [selectedManagerId, setSelectedManagerId] = useState("");

  // Location Assignment Modal
  const [showAssignLocationModal, setShowAssignLocationModal] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState("");

  // Supporting Queries
  const legalEntities = useQuery({
    queryKey: ["hrms-legal-entities", companyId],
    queryFn: () => api<{ results: LegalEntityRow[] }>(`${root}/legal-entities/`),
    enabled: canManage,
  });

  const workLocations = useQuery({
    queryKey: ["hrms-work-locations", companyId],
    queryFn: () => api<{ results: WorkLocationRow[] }>(`${root}/work-locations/`),
    enabled: canManage,
  });

  const orgUnits = useQuery({
    queryKey: ["organization-units", companyId],
    queryFn: () =>
      api<{ results: Array<{ id: string; name: string; unit_type_id?: string; unit_type_label?: string; parent_id?: string }> }>(
        `/api/v1/companies/${companyId}/organization/`
      ),
    enabled: canManage,
  });

  const eligiblePeople = useQuery({
    queryKey: ["hrms-eligible-people", companyId],
    queryFn: () => api<{ results: EligiblePerson[] }>(`${root}/eligible-people/`),
    enabled: canManage && showAddEmpModal,
  });

  const teamDirectory = useQuery({
    queryKey: ["hrms-team-directory", companyId],
    queryFn: () => api<{ results: TeamMember[] }>(`${root}/team/directory/`),
    enabled: isManager,
  });

  // Mutations
  const syncPlatformMembers = useMutation({
    mutationFn: () =>
      api<{ message: string; synced_count: number }>(`${root}/employments/sync/`, {
        method: "POST",
      }),
    onSuccess: async (data) => {
      setFeedback(data?.message || "Platform members synchronized with HRMS.");
      await queryClient.invalidateQueries({ queryKey: ["hrms-employments-directory", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-eligible-people", companyId] });
      onRefreshEmployments();
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const createPersonMutation = useMutation({
    mutationFn: (data: { first_name: string; last_name: string; work_email: string; job_title: string; department_id?: string }) =>
      api<{ id: string; first_name: string; last_name: string; work_email: string; job_title: string; department_id?: string }>(
        `/api/v1/companies/${companyId}/people/`,
        {
          method: "POST",
          body: JSON.stringify(data),
        }
      ),
    onSuccess: async (createdPerson) => {
      await queryClient.invalidateQueries({ queryKey: ["hrms-eligible-people", companyId] });
      const eligible: EligiblePerson = {
        id: createdPerson.id,
        person_id: createdPerson.id,
        first_name: createdPerson.first_name,
        last_name: createdPerson.last_name,
        name: `${createdPerson.first_name} ${createdPerson.last_name}`.trim(),
        email: createdPerson.work_email,
        designation: createdPerson.job_title,
        department_id: inlineDeptId || null,
        department_name: (orgUnits.data?.results ?? []).find((u) => u.id === inlineDeptId)?.name || "",
        login_status: "no_account",
        has_login: false,
        invitation_status: "none",
      };
      setSelectedPerson(eligible);
      setNewEmpNumber(`EMP-${createdPerson.id.slice(0, 6).toUpperCase()}`);
      setNewJobTitle(createdPerson.job_title || "");
      setNewDeptId(inlineDeptId || "");
      setModalError(null);
      setWizardStep("employment");
    },
    onError: (err) => setModalError(errorText(err)),
  });

  const createEmployee = useMutation({
    mutationFn: (data: {
      person_id: string;
      employee_number: string;
      job_title: string;
      employment_type: string;
      starts_on: string;
      legal_entity_id?: string;
      department_id?: string;
      work_location_id?: string;
      manager_employment_id?: string;
      status: string;
    }) =>
      api(`${root}/employments/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: async () => {
      setFeedback("Employee record created successfully.");
      setShowAddEmpModal(false);
      onCloseAddModal?.();
      resetWizard();
      await queryClient.invalidateQueries({ queryKey: ["hrms-employments-directory", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-eligible-people", companyId] });
      onRefreshEmployments();
    },
    onError: (err) => setModalError(errorText(err)),
  });

  const sendInviteMutation = useMutation({
    mutationFn: ({ personId, email }: { personId: string; email: string }) =>
      api(`/api/v1/companies/${companyId}/invitations/`, {
        method: "POST",
        body: JSON.stringify({ person_id: personId, email }),
      }),
    onSuccess: async () => {
      setFeedback("Login invitation sent successfully.");
      await queryClient.invalidateQueries({ queryKey: ["hrms-employments-directory", companyId] });
      onRefreshEmployments();
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
      setStatusTargetEmp(null);
      setStatusReason("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-employments-directory", companyId] });
      onRefreshEmployments();
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const assignLocation = useMutation({
    mutationFn: ({ employmentId, locationId }: { employmentId: string; locationId: string }) =>
      api(`${root}/employments/${employmentId}/work-location/`, {
        method: "POST",
        body: JSON.stringify({
          work_location_id: locationId,
          starts_on: new Date().toISOString().slice(0, 10),
        }),
      }),
    onSuccess: async () => {
      setFeedback("Work location assigned successfully.");
      setShowAssignLocationModal(false);
      await queryClient.invalidateQueries({ queryKey: ["hrms-employments-directory", companyId] });
      onRefreshEmployments();
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const assignManager = useMutation({
    mutationFn: ({ reportId, managerId }: { reportId: string; managerId: string }) =>
      api(`${root}/reporting-lines/`, {
        method: "POST",
        body: JSON.stringify({
          manager_employment_id: managerId,
          report_employment_id: reportId,
          starts_on: new Date().toISOString().slice(0, 10),
        }),
      }),
    onSuccess: async () => {
      setFeedback("Reporting manager assigned successfully.");
      setShowAssignManagerModal(false);
      await queryClient.invalidateQueries({ queryKey: ["hrms-employments-directory", companyId] });
      onRefreshEmployments();
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const resetWizard = () => {
    setWizardStep("select_person");
    setSelectedPerson(null);
    setPersonSearch("");
    setModalError(null);
    setInlineFirstName("");
    setInlineLastName("");
    setInlineEmail("");
    setInlineJobTitle("");
    setInlineDeptId("");
    setNewEmpNumber("");
    setNewJobTitle("");
    setNewEmpType("full_time");
    setNewStartsOn(new Date().toISOString().slice(0, 10));
    setNewLegalEntityId("");
    setNewDeptId("");
    setNewLocationId("");
    setNewManagerId("");
    setNewStatus("active");
  };

  const handleSelectPerson = (person: EligiblePerson) => {
    setSelectedPerson(person);
    setNewEmpNumber(`EMP-${person.id.slice(0, 6).toUpperCase()}`);
    setNewJobTitle(person.designation || "");
    setNewDeptId(person.department_id || "");
    setModalError(null);
    setWizardStep("employment");
  };

  // Scope filter: All vs My Team
  const teamMemberIds = new Set((teamDirectory.data?.results ?? []).map((m) => m.id));
  const scopedEmployments =
    viewScope === "team"
      ? employments.filter((emp) => teamMemberIds.has(emp.id))
      : employments;

  // Filter employments
  const filteredEmployments = scopedEmployments.filter((emp) => {
    const matchesSearch =
      !searchQuery ||
      emp.person_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.employee_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.job_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (emp.person_email && emp.person_email.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = !statusFilter || emp.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Filter eligible people
  const filteredEligible = (eligiblePeople.data?.results ?? []).filter((p) => {
    if (!personSearch) return true;
    const q = personSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      p.designation.toLowerCase().includes(q) ||
      (p.department_name && p.department_name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Feedback Alert */}
      {feedback && (
        <div className="rounded-md border border-pulse-border bg-pulse-hover px-4 py-2.5 text-xs font-semibold text-pulse-ink flex items-center justify-between">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-pulse-muted hover:text-pulse-ink ml-3"
          >
            &times;
          </button>
        </div>
      )}

      {/* Header and Controls */}
      <section className={panelClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-pulse-ink">People & Employee Directory</h2>
            <p className="text-xs text-pulse-muted">
              {employments.length} personnel records connected across People, Identity and HRMS.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
              <>
                <Button
                  variant="secondary"
                  disabled={syncPlatformMembers.isPending}
                  onClick={() => syncPlatformMembers.mutate()}
                >
                  {syncPlatformMembers.isPending ? "Syncing..." : "Sync Platform Users"}
                </Button>
                <Button
                  onClick={() => {
                    resetWizard();
                    setShowAddEmpModal(true);
                  }}
                >
                  + Add Employee
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Filter Controls */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-pulse-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search by name, #, email or title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-md border border-pulse-border bg-pulse-surface px-3 py-1.5 text-xs text-pulse-ink placeholder:text-pulse-muted focus:border-pulse-accent focus:outline-none w-64"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-pulse-border bg-pulse-surface px-3 py-1.5 text-xs text-pulse-ink"
            >
              <option value="">All Employment Statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="draft">Draft</option>
              <option value="on_leave">On Leave</option>
              <option value="suspended">Suspended</option>
              <option value="ended">Ended</option>
            </select>
          </div>

          {isManager && canManage && (
            <div className="flex rounded-md border border-pulse-border bg-pulse-hover p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewScope("all")}
                className={`rounded px-2.5 py-1 font-semibold transition ${
                  viewScope === "all" ? "bg-pulse-surface text-pulse-accent shadow-sm" : "text-pulse-muted"
                }`}
              >
                All Company
              </button>
              <button
                type="button"
                onClick={() => setViewScope("team")}
                className={`rounded px-2.5 py-1 font-semibold transition ${
                  viewScope === "team" ? "bg-pulse-surface text-pulse-accent shadow-sm" : "text-pulse-muted"
                }`}
              >
                My Team
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Directory Table */}
      {filteredEmployments.length === 0 ? (
        <EmptyState
          title="No employees found"
          body="No employee records match the selected filter criteria."
        />
      ) : (
        <section className={`${panelClass} overflow-hidden p-0`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-pulse-border bg-pulse-hover/50 text-pulse-muted">
                  <th className="px-4 py-3 font-semibold">Employee</th>
                  <th className="px-4 py-3 font-semibold">Employee #</th>
                  <th className="px-4 py-3 font-semibold">Designation</th>
                  <th className="px-4 py-3 font-semibold">Department</th>
                  <th className="px-4 py-3 font-semibold">Branch</th>
                  <th className="px-4 py-3 font-semibold">Reporting Manager</th>
                  <th className="px-4 py-3 font-semibold">Employment Status</th>
                  <th className="px-4 py-3 font-semibold">Login Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pulse-border">
                {filteredEmployments.map((emp) => (
                  <tr key={emp.id} className="hover:bg-pulse-hover/60 transition">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-pulse-ink">{emp.person_name}</div>
                      <div className="text-[11px] text-pulse-muted">{emp.person_email || emp.employment_type || "Full Time"}</div>
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-pulse-muted">{emp.employee_number || "—"}</td>
                    <td className="px-4 py-3 font-medium text-pulse-ink">{emp.job_title || "Team Member"}</td>
                    <td className="px-4 py-3 text-pulse-muted">{emp.department_name || "—"}</td>
                    <td className="px-4 py-3 text-pulse-muted">{emp.branch_name || emp.work_location_name || "—"}</td>
                    <td className="px-4 py-3 text-pulse-muted">{emp.manager_name || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          emp.status === "active"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : emp.status === "on_leave"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                            : emp.status === "draft"
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                            : emp.status === "suspended"
                            ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                            : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                        }`}
                      >
                        {emp.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          emp.login_status === "active"
                            ? "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300"
                            : emp.login_status === "invited"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                            : emp.login_status === "suspended"
                            ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                      >
                        {emp.login_status === "active"
                          ? "Active Account"
                          : emp.login_status === "invited"
                          ? "Pending Invite"
                          : emp.login_status === "suspended"
                          ? "Suspended"
                          : "No Login Account"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setSelectedEmp(emp)}
                        >
                          View Details
                        </Button>
                        {canManage && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setStatusTargetEmp(emp);
                              setTargetStatus(emp.status === "active" ? "on_leave" : "active");
                            }}
                          >
                            Status
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Selected Employee Detail Drawer */}
      {selectedEmp && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
          <div className="h-full w-full max-w-md bg-pulse-surface p-6 shadow-2xl overflow-y-auto space-y-5 border-l border-pulse-border">
            <div className="flex items-start justify-between border-b border-pulse-border pb-4">
              <div>
                <p className={labelClass}>Employee Profile</p>
                <h3 className="text-xl font-bold text-pulse-ink">{selectedEmp.person_name}</h3>
                <p className="text-xs text-pulse-muted">
                  {selectedEmp.job_title} · {selectedEmp.employee_number}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEmp(null)}
                className="text-pulse-muted hover:text-pulse-ink text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {/* Identity & Account Status */}
            <div className="rounded-lg border border-pulse-border p-3.5 space-y-2 bg-pulse-hover/30">
              <h4 className="text-xs font-bold uppercase tracking-wider text-pulse-ink">Identity & Login Account</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-pulse-muted">Work Email:</span>
                  <p className="font-semibold text-pulse-ink">{selectedEmp.person_email || "Not recorded"}</p>
                </div>
                <div>
                  <span className="text-pulse-muted">Account Access:</span>
                  <p className="font-semibold text-pulse-ink capitalize">{selectedEmp.login_status?.replace("_", " ") || "No account"}</p>
                </div>
              </div>
              {selectedEmp.login_status === "no_account" && selectedEmp.person_email && canManage && (
                <div className="pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full text-xs"
                    disabled={sendInviteMutation.isPending}
                    onClick={() =>
                      sendInviteMutation.mutate({
                        personId: selectedEmp.person_id,
                        email: selectedEmp.person_email!,
                      })
                    }
                  >
                    {sendInviteMutation.isPending ? "Sending..." : "✉ Send Platform Invitation"}
                  </Button>
                </div>
              )}
            </div>

            {/* Employment Details */}
            <div className="rounded-lg border border-pulse-border p-3.5 space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-pulse-ink">Employment Terms</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-pulse-muted">Type:</span>
                  <p className="font-semibold text-pulse-ink capitalize">{selectedEmp.employment_type?.replace("_", " ")}</p>
                </div>
                <div>
                  <span className="text-pulse-muted">Status:</span>
                  <p className="font-semibold text-pulse-ink capitalize">{selectedEmp.status}</p>
                </div>
                <div>
                  <span className="text-pulse-muted">Joining Date:</span>
                  <p className="font-semibold text-pulse-ink">{selectedEmp.starts_on}</p>
                </div>
                <div>
                  <span className="text-pulse-muted">Legal Entity:</span>
                  <p className="font-semibold text-pulse-ink">{selectedEmp.legal_entity_name || "Primary Entity"}</p>
                </div>
              </div>
            </div>

            {/* Organization Assignments */}
            <div className="rounded-lg border border-pulse-border p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-pulse-ink">Organization Structure</h4>
              </div>
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-pulse-muted">Department:</span>
                  <p className="font-semibold text-pulse-ink">{selectedEmp.department_name || "Unassigned"}</p>
                </div>
                <div>
                  <span className="text-pulse-muted">Branch / Division:</span>
                  <p className="font-semibold text-pulse-ink">{selectedEmp.branch_name || "—"}</p>
                </div>
                <div>
                  <span className="text-pulse-muted">Work Location:</span>
                  <p className="font-semibold text-pulse-ink">{selectedEmp.work_location_name || "Unassigned"}</p>
                </div>
                <div>
                  <span className="text-pulse-muted">Reporting Manager:</span>
                  <p className="font-semibold text-pulse-ink">{selectedEmp.manager_name || "Unassigned"}</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-pulse-border space-y-2">
              {canManage && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowAssignLocationModal(true);
                      setSelectedLocationId(selectedEmp.work_location_id || "");
                    }}
                  >
                    Change Location
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowAssignManagerModal(true);
                      setSelectedManagerId(selectedEmp.manager_id || "");
                    }}
                  >
                    Change Manager
                  </Button>
                </div>
              )}
              <Button variant="secondary" className="w-full" onClick={() => setSelectedEmp(null)}>
                Close Panel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Redesigned 4-Step Create Employee Record Wizard Modal */}
      {showAddEmpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-xl border border-pulse-border bg-pulse-surface p-6 shadow-2xl space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-pulse-border pb-3">
              <div>
                <h3 className="text-lg font-bold text-pulse-ink">Create Employee Record</h3>
                <p className="text-xs text-pulse-muted">
                  Connect platform people, identity, organization units and HRMS employment.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddEmpModal(false);
                  onCloseAddModal?.();
                  resetWizard();
                }}
                className="text-pulse-muted hover:text-pulse-ink text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {/* Progress Step Indicator */}
            <div className="flex items-center justify-between border-b border-pulse-border pb-3 text-xs">
              <span className={`font-semibold ${wizardStep === "select_person" || wizardStep === "create_person" ? "text-pulse-accent" : "text-pulse-muted"}`}>
                1. Select / Create Person
              </span>
              <span className="text-pulse-muted">&rarr;</span>
              <span className={`font-semibold ${wizardStep === "employment" ? "text-pulse-accent" : "text-pulse-muted"}`}>
                2. Employment Terms
              </span>
              <span className="text-pulse-muted">&rarr;</span>
              <span className={`font-semibold ${wizardStep === "review" ? "text-pulse-accent" : "text-pulse-muted"}`}>
                3. Review & Create
              </span>
            </div>

            {/* Modal Error Banner */}
            {modalError && (
              <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
                {modalError}
              </div>
            )}

            {/* STEP 1: SELECT EXISTING PERSON */}
            {wizardStep === "select_person" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <input
                    type="text"
                    placeholder="Search people by name, email, designation..."
                    value={personSearch}
                    onChange={(e) => setPersonSearch(e.target.value)}
                    className="flex-1 rounded-md border border-pulse-border bg-pulse-surface px-3 py-1.5 text-xs text-pulse-ink placeholder:text-pulse-muted focus:border-pulse-accent focus:outline-none"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setModalError(null);
                      setWizardStep("create_person");
                    }}
                  >
                    + Create New Person
                  </Button>
                </div>

                <div className="max-h-64 overflow-y-auto rounded-md border border-pulse-border divide-y divide-pulse-border">
                  {eligiblePeople.isLoading ? (
                    <div className="p-4 text-center text-xs text-pulse-muted">Loading eligible people...</div>
                  ) : filteredEligible.length === 0 ? (
                    <div className="p-6 text-center text-xs text-pulse-muted">
                      <p className="font-semibold text-pulse-ink">No eligible person found</p>
                      <p className="mt-1">
                        All existing people may already have active employment records, or no person matched "{personSearch}".
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mt-3"
                        onClick={() => {
                          setModalError(null);
                          setWizardStep("create_person");
                        }}
                      >
                        + Create a Person in Pulse
                      </Button>
                    </div>
                  ) : (
                    filteredEligible.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => handleSelectPerson(p)}
                        className="p-3 hover:bg-pulse-hover cursor-pointer transition flex items-center justify-between"
                      >
                        <div>
                          <div className="font-semibold text-pulse-ink">{p.name}</div>
                          <div className="text-[11px] text-pulse-muted">
                            {p.email || "No email"} · {p.designation || "No designation"} {p.department_name ? `· ${p.department_name}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              p.login_status === "active"
                                ? "bg-teal-50 text-teal-700"
                                : p.login_status === "invited"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {p.login_status === "active" ? "Active Account" : p.login_status === "invited" ? "Pending Invite" : "No Account"}
                          </span>
                          <span className="text-pulse-accent text-xs font-semibold">Select &rarr;</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => {
                      setShowAddEmpModal(false);
                      onCloseAddModal?.();
                      resetWizard();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 2: CREATE PERSON INLINE (WHEN NECESSARY) */}
            {wizardStep === "create_person" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createPersonMutation.mutate({
                    first_name: inlineFirstName,
                    last_name: inlineLastName,
                    work_email: inlineEmail,
                    job_title: inlineJobTitle,
                    department_id: inlineDeptId || undefined,
                  });
                }}
                className="space-y-3.5 text-xs"
              >
                <div className="rounded-md border border-pulse-border bg-pulse-hover/30 p-3 text-xs text-pulse-muted">
                  Create a new person in the shared platform People directory. Once created, they will be automatically selected for HRMS employment.
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="font-semibold text-pulse-ink">First Name *</span>
                    <input
                      type="text"
                      required
                      value={inlineFirstName}
                      onChange={(e) => setInlineFirstName(e.target.value)}
                      className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                    />
                  </label>
                  <label className="block">
                    <span className="font-semibold text-pulse-ink">Last Name</span>
                    <input
                      type="text"
                      value={inlineLastName}
                      onChange={(e) => setInlineLastName(e.target.value)}
                      className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="font-semibold text-pulse-ink">Work Email *</span>
                    <input
                      type="email"
                      required
                      value={inlineEmail}
                      onChange={(e) => setInlineEmail(e.target.value)}
                      className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                    />
                  </label>
                  <label className="block">
                    <span className="font-semibold text-pulse-ink">Designation *</span>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Lead Engineer"
                      value={inlineJobTitle}
                      onChange={(e) => setInlineJobTitle(e.target.value)}
                      className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="font-semibold text-pulse-ink">Organization Department</span>
                  <select
                    value={inlineDeptId}
                    onChange={(e) => setInlineDeptId(e.target.value)}
                    className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                  >
                    <option value="">Unassigned</option>
                    {(orgUnits.data?.results ?? []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex justify-between pt-3 border-t border-pulse-border">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => {
                      setModalError(null);
                      setWizardStep("select_person");
                    }}
                  >
                    &larr; Back to Person Selector
                  </Button>
                  <Button type="submit" disabled={createPersonMutation.isPending}>
                    {createPersonMutation.isPending ? "Creating Person..." : "Save & Continue to Employment \u2192"}
                  </Button>
                </div>
              </form>
            )}

            {/* STEP 3: EMPLOYMENT & ORGANIZATION INFORMATION */}
            {wizardStep === "employment" && selectedPerson && (
              <div className="space-y-4 text-xs">
                {/* Person Banner */}
                <div className="rounded-lg border border-pulse-border bg-pulse-hover/40 p-3 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-pulse-muted uppercase font-bold tracking-wider">Selected Person</span>
                    <p className="font-bold text-pulse-ink text-sm">{selectedPerson.name}</p>
                    <p className="text-pulse-muted text-xs">{selectedPerson.email} · {selectedPerson.designation}</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setWizardStep("select_person")}
                  >
                    Change Person
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="font-semibold text-pulse-ink">Employee Number *</span>
                    <input
                      type="text"
                      required
                      placeholder="e.g. EMP-1001"
                      value={newEmpNumber}
                      onChange={(e) => setNewEmpNumber(e.target.value)}
                      className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink font-mono"
                    />
                  </label>
                  <label className="block">
                    <span className="font-semibold text-pulse-ink">Job Title *</span>
                    <input
                      type="text"
                      required
                      value={newJobTitle}
                      onChange={(e) => setNewJobTitle(e.target.value)}
                      className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="font-semibold text-pulse-ink">Employment Type</span>
                    <select
                      value={newEmpType}
                      onChange={(e) => setNewEmpType(e.target.value)}
                      className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                    >
                      <option value="full_time">Full Time</option>
                      <option value="part_time">Part Time</option>
                      <option value="contractor">Contractor</option>
                      <option value="intern">Intern</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="font-semibold text-pulse-ink">Joining Date *</span>
                    <input
                      type="date"
                      required
                      value={newStartsOn}
                      onChange={(e) => setNewStartsOn(e.target.value)}
                      className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="font-semibold text-pulse-ink">Legal Entity</span>
                    <select
                      value={newLegalEntityId}
                      onChange={(e) => setNewLegalEntityId(e.target.value)}
                      className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                    >
                      <option value="">Default Company Entity</option>
                      {(legalEntities.data?.results ?? []).map((ent) => (
                        <option key={ent.id} value={ent.id}>
                          {ent.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="font-semibold text-pulse-ink">Work Location</span>
                    <select
                      value={newLocationId}
                      onChange={(e) => setNewLocationId(e.target.value)}
                      className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                    >
                      <option value="">Unassigned</option>
                      {(workLocations.data?.results ?? []).map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name} ({loc.code})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="font-semibold text-pulse-ink">Department</span>
                    <select
                      value={newDeptId}
                      onChange={(e) => setNewDeptId(e.target.value)}
                      className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                    >
                      <option value="">Unassigned</option>
                      {(orgUnits.data?.results ?? []).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="font-semibold text-pulse-ink">Reporting Manager</span>
                    <select
                      value={newManagerId}
                      onChange={(e) => setNewManagerId(e.target.value)}
                      className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                    >
                      <option value="">None / Reports to Exec</option>
                      {employments
                        .filter((e) => e.status === "active")
                        .map((mgr) => (
                          <option key={mgr.id} value={mgr.id}>
                            {mgr.person_name} · {mgr.job_title} ({mgr.employee_number})
                          </option>
                        ))}
                    </select>
                  </label>
                </div>

                <div className="flex justify-between pt-3 border-t border-pulse-border">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setWizardStep("select_person")}
                  >
                    &larr; Back
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      if (!newEmpNumber.trim() || !newJobTitle.trim() || !newStartsOn) {
                        setModalError("Please complete the required fields (Employee #, Job Title, Joining Date).");
                        return;
                      }
                      setModalError(null);
                      setWizardStep("review");
                    }}
                  >
                    Next: Review & Confirm &rarr;
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 4: REVIEW & CREATE */}
            {wizardStep === "review" && selectedPerson && (
              <div className="space-y-4 text-xs">
                <div className="rounded-lg border border-pulse-border bg-pulse-hover/20 p-4 space-y-3">
                  <h4 className="font-bold text-pulse-ink uppercase tracking-wider text-xs border-b border-pulse-border pb-2">
                    Review Employee Profile Configuration
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-pulse-muted">Person:</span>
                      <p className="font-bold text-pulse-ink">{selectedPerson.name}</p>
                      <p className="text-pulse-muted text-[11px]">{selectedPerson.email}</p>
                    </div>
                    <div>
                      <span className="text-pulse-muted">Employee Number:</span>
                      <p className="font-bold font-mono text-pulse-ink">{newEmpNumber}</p>
                    </div>
                    <div>
                      <span className="text-pulse-muted">Designation:</span>
                      <p className="font-bold text-pulse-ink">{newJobTitle}</p>
                    </div>
                    <div>
                      <span className="text-pulse-muted">Employment Type:</span>
                      <p className="font-bold text-pulse-ink capitalize">{newEmpType.replace("_", " ")}</p>
                    </div>
                    <div>
                      <span className="text-pulse-muted">Start Date:</span>
                      <p className="font-bold text-pulse-ink">{newStartsOn}</p>
                    </div>
                    <div>
                      <span className="text-pulse-muted">Status:</span>
                      <p className="font-bold text-pulse-ink capitalize">{newStatus}</p>
                    </div>
                    <div>
                      <span className="text-pulse-muted">Department:</span>
                      <p className="font-bold text-pulse-ink">
                        {(orgUnits.data?.results ?? []).find((u) => u.id === newDeptId)?.name || "Unassigned"}
                      </p>
                    </div>
                    <div>
                      <span className="text-pulse-muted">Work Location:</span>
                      <p className="font-bold text-pulse-ink">
                        {(workLocations.data?.results ?? []).find((l) => l.id === newLocationId)?.name || "Unassigned"}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-pulse-muted">Reporting Manager:</span>
                      <p className="font-bold text-pulse-ink">
                        {employments.find((e) => e.id === newManagerId)?.person_name || "None / Unassigned"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-3 border-t border-pulse-border">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setWizardStep("employment")}
                  >
                    &larr; Back to Edit
                  </Button>
                  <Button
                    type="button"
                    disabled={createEmployee.isPending}
                    onClick={() => {
                      createEmployee.mutate({
                        person_id: selectedPerson.id,
                        employee_number: newEmpNumber,
                        job_title: newJobTitle,
                        employment_type: newEmpType,
                        starts_on: newStartsOn,
                        legal_entity_id: newLegalEntityId || undefined,
                        department_id: newDeptId || undefined,
                        work_location_id: newLocationId || undefined,
                        manager_employment_id: newManagerId || undefined,
                        status: newStatus,
                      });
                    }}
                  >
                    {createEmployee.isPending ? "Creating Employee..." : "Confirm & Create Employee Record"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status Change Modal */}
      {statusTargetEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-pulse-ink">
              Update Status: {statusTargetEmp.person_name}
            </h3>

            <div className="space-y-3 text-xs">
              <label className="block">
                <span className="font-semibold text-pulse-ink">Target Status</span>
                <select
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                >
                  <option value="active">Active</option>
                  <option value="on_leave">On Leave</option>
                  <option value="suspended">Suspended</option>
                  <option value="ended">Ended</option>
                </select>
              </label>

              <label className="block">
                <span className="font-semibold text-pulse-ink">Reason / Remarks *</span>
                <textarea
                  required
                  rows={2}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="Provide audit reason for lifecycle transition..."
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
              <Button variant="secondary" onClick={() => setStatusTargetEmp(null)}>
                Cancel
              </Button>
              <Button
                disabled={!statusReason.trim() || updateEmpStatus.isPending}
                onClick={() =>
                  updateEmpStatus.mutate({
                    employmentId: statusTargetEmp.id,
                    status: targetStatus,
                    reason: statusReason,
                  })
                }
              >
                {updateEmpStatus.isPending ? "Updating..." : "Update Status"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Location Assignment Modal */}
      {showAssignLocationModal && selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-pulse-ink">
              Assign Work Location: {selectedEmp.person_name}
            </h3>

            <label className="block text-xs">
              <span className="font-semibold text-pulse-ink">Location</span>
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
              >
                <option value="">Select location...</option>
                {(workLocations.data?.results ?? []).map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.timezone || "Default"})
                  </option>
                ))}
              </select>
            </label>

            <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
              <Button variant="secondary" onClick={() => setShowAssignLocationModal(false)}>
                Cancel
              </Button>
              <Button
                disabled={!selectedLocationId || assignLocation.isPending}
                onClick={() =>
                  assignLocation.mutate({
                    employmentId: selectedEmp.id,
                    locationId: selectedLocationId,
                  })
                }
              >
                {assignLocation.isPending ? "Saving..." : "Assign Location"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Manager Assignment Modal */}
      {showAssignManagerModal && selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-pulse-ink">
              Assign Reporting Manager: {selectedEmp.person_name}
            </h3>

            <label className="block text-xs">
              <span className="font-semibold text-pulse-ink">Manager</span>
              <select
                value={selectedManagerId}
                onChange={(e) => setSelectedManagerId(e.target.value)}
                className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
              >
                <option value="">Select supervisor...</option>
                {employments
                  .filter((e) => e.id !== selectedEmp.id && e.status === "active")
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.person_name} · {m.job_title}
                    </option>
                  ))}
              </select>
            </label>

            <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
              <Button variant="secondary" onClick={() => setShowAssignManagerModal(false)}>
                Cancel
              </Button>
              <Button
                disabled={!selectedManagerId || assignManager.isPending}
                onClick={() =>
                  assignManager.mutate({
                    reportId: selectedEmp.id,
                    managerId: selectedManagerId,
                  })
                }
              >
                {assignManager.isPending ? "Saving..." : "Assign Manager"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
