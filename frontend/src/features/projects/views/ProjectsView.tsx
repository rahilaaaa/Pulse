import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../shared/api/client";
import { LoadingState } from "../../../shared/ui/States";
import type {
  ProjectSummary,
  ProjectDetail,
  ProjectStatus,
  ProjectPriority,
  TaskSummary,
} from "../types";

interface ProjectsViewProps {
  companyId: string;
  permissions: string[];
  onOpenTaskDetail: (taskId: string) => void;
  onOpenCreateTaskForProject?: (projectId: string) => void;
}

interface PersonOption {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface UnitOption {
  id: string;
  name: string;
  kind?: string;
}

function formatPersonName(person: string | { id?: string; name?: string } | null | undefined): string {
  if (!person) return "";
  if (typeof person === "object") return person.name || "";
  return String(person);
}

export function ProjectsView({
  companyId,
  permissions,
  onOpenTaskDetail,
  onOpenCreateTaskForProject,
}: ProjectsViewProps) {
  const queryClient = useQueryClient();
  const canManage = permissions.includes("projects.manage");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Queries
  const projectsQuery = useQuery({
    queryKey: ["projects-list", companyId],
    queryFn: () => api<{ results: ProjectSummary[] }>(`/api/v1/companies/${companyId}/projects/projects/`),
  });

  const peopleQuery = useQuery({
    queryKey: ["company-people-options", companyId],
    queryFn: () => api<{ results: PersonOption[] }>(`/api/v1/companies/${companyId}/people/`),
  });

  const unitsQuery = useQuery({
    queryKey: ["company-units-options", companyId],
    queryFn: () => api<{ units: UnitOption[] }>(`/api/v1/companies/${companyId}/organization/units/`),
  });

  // Project Detail Query
  const detailQuery = useQuery({
    queryKey: ["project-detail", companyId, selectedProjectId],
    queryFn: () => api<ProjectDetail>(`/api/v1/companies/${companyId}/projects/projects/${selectedProjectId}/`),
    enabled: Boolean(selectedProjectId),
  });

  // Create Project Form State
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formOwner, setFormOwner] = useState("");
  const [formPM, setFormPM] = useState("");
  const [formPriority, setFormPriority] = useState<ProjectPriority>("medium");
  const [formStartDate, setFormStartDate] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formBudget, setFormBudget] = useState("0.00");
  const [formBillable, setFormBillable] = useState(true);
  const [formUnits, setFormUnits] = useState<string[]>([]);
  const [createError, setCreateError] = useState("");

  // Create Project Mutation
  const createProjectMutation = useMutation({
    mutationFn: () =>
      api(`/api/v1/companies/${companyId}/projects/projects/`, {
        method: "POST",
        body: JSON.stringify({
          name: formName,
          code: formCode || undefined,
          description: formDescription,
          owner_person_id: formOwner || undefined,
          project_manager_id: formPM || undefined,
          priority: formPriority,
          start_date: formStartDate || undefined,
          due_date: formDueDate || undefined,
          estimated_budget: formBudget,
          is_billable: formBillable,
          department_ids: formUnits,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects-list", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["projects-dashboard", companyId] });
      setShowCreateModal(false);
      resetCreateForm();
    },
    onError: (err: unknown) => {
      setCreateError(err instanceof ApiError ? err.message : "Failed to create project");
    },
  });

  // Add Milestone Form State
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDate, setMilestoneDate] = useState("");
  const [milestoneDesc, setMilestoneDesc] = useState("");

  const addMilestoneMutation = useMutation({
    mutationFn: () =>
      api(`/api/v1/companies/${companyId}/projects/projects/${selectedProjectId}/milestones/`, {
        method: "POST",
        body: JSON.stringify({
          title: milestoneTitle,
          due_date: milestoneDate || undefined,
          description: milestoneDesc,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project-detail", companyId, selectedProjectId] });
      setMilestoneTitle("");
      setMilestoneDate("");
      setMilestoneDesc("");
    },
  });

  // Add Member Form State
  const [memberPersonId, setMemberPersonId] = useState("");
  const [memberRole, setMemberRole] = useState("Contributor");
  const [memberAllocation, setMemberAllocation] = useState(100);

  const addMemberMutation = useMutation({
    mutationFn: () =>
      api(`/api/v1/companies/${companyId}/projects/projects/${selectedProjectId}/members/`, {
        method: "POST",
        body: JSON.stringify({
          person_id: memberPersonId,
          role: memberRole,
          allocation_percentage: memberAllocation,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project-detail", companyId, selectedProjectId] });
      setMemberPersonId("");
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) =>
      api(`/api/v1/companies/${companyId}/projects/projects/${selectedProjectId}/members/${memberId}/`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project-detail", companyId, selectedProjectId] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: ProjectStatus) =>
      api(`/api/v1/companies/${companyId}/projects/projects/${selectedProjectId}/`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project-detail", companyId, selectedProjectId] });
      await queryClient.invalidateQueries({ queryKey: ["projects-list", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["projects-dashboard", companyId] });
    },
  });

  const resetCreateForm = () => {
    setFormName("");
    setFormCode("");
    setFormDescription("");
    setFormOwner("");
    setFormPM("");
    setFormPriority("medium");
    setFormStartDate("");
    setFormDueDate("");
    setFormBudget("0.00");
    setFormBillable(true);
    setFormUnits([]);
    setCreateError("");
  };

  if (projectsQuery.isLoading || !projectsQuery.data) {
    return <LoadingState label="Loading company projects..." />;
  }

  const projects = projectsQuery.data.results || [];
  const people = peopleQuery.data?.results || [];
  const units = unitsQuery.data?.units || [];

  const filteredProjects = projects.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchCode = p.code.toLowerCase().includes(q);
      const matchOwner = formatPersonName(p.owner_person).toLowerCase().includes(q);
      const matchPM = formatPersonName(p.project_manager).toLowerCase().includes(q);
      return matchName || matchCode || matchOwner || matchPM;
    }
    return true;
  });

  const priorityColors: Record<string, string> = {
    urgent: "bg-rose-100 text-rose-800 border-rose-200",
    high: "bg-amber-100 text-amber-800 border-amber-200",
    medium: "bg-blue-100 text-blue-800 border-blue-200",
    low: "bg-slate-100 text-slate-700 border-slate-200",
  };

  const statusColors: Record<string, string> = {
    planning: "bg-purple-100 text-purple-800",
    active: "bg-teal-100 text-teal-800",
    on_hold: "bg-amber-100 text-amber-800",
    completed: "bg-emerald-100 text-emerald-800",
    cancelled: "bg-rose-100 text-rose-800",
  };

  return (
    <div className="space-y-6">
      {/* Top Filter & Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 max-w-lg">
          <input
            type="text"
            placeholder="Search projects by title, code, owner, PM..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-pulse-border bg-white px-3 py-2 text-sm text-pulse-ink placeholder-pulse-muted focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-pulse-border bg-white px-3 py-2 text-sm text-pulse-ink focus:border-teal-600 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center justify-center rounded-md bg-[#0D9488] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0f766e] transition-colors"
          >
            + Create Project
          </button>
        )}
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-pulse-border p-12 text-center bg-pulse-surface">
          <p className="text-sm font-medium text-pulse-ink">No projects found</p>
          <p className="mt-1 text-xs text-pulse-muted">
            {search || statusFilter !== "all"
              ? "Try adjusting your search or filters."
              : "Get started by creating your company's first project."}
          </p>
          {canManage && !search && statusFilter === "all" && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="mt-4 rounded-md bg-[#0D9488] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0f766e]"
            >
              Create Project
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelectedProjectId(p.id)}
              className="group cursor-pointer rounded-xl border border-pulse-border bg-white p-5 shadow-sm transition hover:shadow-md hover:border-teal-500 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                    {p.code}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider ${
                        statusColors[p.status] || "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {p.status_label || p.status}
                    </span>
                    <span
                      className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${
                        priorityColors[p.priority] || "bg-gray-100 text-gray-700 border-gray-200"
                      }`}
                    >
                      {p.priority_label || p.priority}
                    </span>
                  </div>
                </div>

                <h3 className="mt-3 text-base font-bold text-pulse-ink group-hover:text-teal-700 transition-colors line-clamp-1">
                  {p.name}
                </h3>
                {p.description && (
                  <p className="mt-1 text-xs text-pulse-muted line-clamp-2 leading-relaxed">
                    {p.description}
                  </p>
                )}

                <div className="mt-4 pt-3 border-t border-pulse-border flex items-center justify-between text-xs text-pulse-muted">
                  <span>PM: <strong className="text-pulse-ink font-medium">{formatPersonName(p.project_manager) || "Unassigned"}</strong></span>
                  <span>Tasks: <strong className="text-pulse-ink font-medium">{p.tasks_completed} / {p.tasks_total}</strong></span>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-pulse-muted">Progress</span>
                  <span className="font-bold text-pulse-ink">{p.progress_percentage}%</span>
                </div>
                <div className="w-full bg-pulse-border rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#0D9488] h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, p.progress_percentage))}%` }}
                  />
                </div>
                {p.due_date && (
                  <div className="mt-2 text-[11px] text-right text-pulse-muted">
                    Due: <span className="font-medium text-pulse-ink">{p.due_date}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE PROJECT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl border border-pulse-border max-h-[90vh] flex flex-col overflow-hidden">
            <div className="border-b border-pulse-border p-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-pulse-ink">Create New Project</h2>
                <p className="text-xs text-pulse-muted">Define project boundaries, management, and department allocations.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  resetCreateForm();
                }}
                className="text-pulse-muted hover:text-pulse-ink text-xl font-bold"
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createProjectMutation.mutate();
              }}
              className="p-6 space-y-4 overflow-y-auto flex-1"
            >
              {createError && (
                <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
                  {createError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-pulse-ink mb-1">Project Name *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. NextGen Client Portal Redesign"
                    className="w-full rounded-md border border-pulse-border px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-pulse-ink mb-1">Project Code</label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    placeholder="Auto (e.g. PRJ-001)"
                    className="w-full rounded-md border border-pulse-border px-3 py-2 text-sm uppercase focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-pulse-ink mb-1">Description</label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Goals, high-level deliverables, and scope..."
                  className="w-full rounded-md border border-pulse-border px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-pulse-ink mb-1">Project Manager</label>
                  <select
                    value={formPM}
                    onChange={(e) => setFormPM(e.target.value)}
                    className="w-full rounded-md border border-pulse-border px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                  >
                    <option value="">Select Manager</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.first_name} {p.last_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-pulse-ink mb-1">Executive Owner</label>
                  <select
                    value={formOwner}
                    onChange={(e) => setFormOwner(e.target.value)}
                    className="w-full rounded-md border border-pulse-border px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                  >
                    <option value="">Select Owner</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.first_name} {p.last_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-pulse-ink mb-1">Priority</label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as ProjectPriority)}
                    className="w-full rounded-md border border-pulse-border px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-pulse-ink mb-1">Start Date</label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full rounded-md border border-pulse-border px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-pulse-ink mb-1">Target Due Date</label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full rounded-md border border-pulse-border px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-pulse-ink mb-1">Budget ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formBudget}
                    onChange={(e) => setFormBudget(e.target.value)}
                    className="w-full rounded-md border border-pulse-border px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-pulse-ink mb-1">Participating Departments / Units</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border border-pulse-border rounded-md p-3 max-h-32 overflow-y-auto">
                  {units.map((u) => {
                    const isChecked = formUnits.includes(u.id);
                    return (
                      <label key={u.id} className="flex items-center gap-2 text-xs text-pulse-ink cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) setFormUnits([...formUnits, u.id]);
                            else setFormUnits(formUnits.filter((x) => x !== u.id));
                          }}
                          className="rounded text-teal-600 focus:ring-teal-500"
                        />
                        <span>{u.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="billable_check"
                  checked={formBillable}
                  onChange={(e) => setFormBillable(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <label htmlFor="billable_check" className="text-xs font-medium text-pulse-ink cursor-pointer">
                  Client Billable Project (tracked hours count as billable)
                </label>
              </div>

              <div className="border-t border-pulse-border pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    resetCreateForm();
                  }}
                  className="rounded-md border border-pulse-border px-4 py-2 text-xs font-semibold text-pulse-muted hover:text-pulse-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createProjectMutation.isPending}
                  className="rounded-md bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0f766e] disabled:opacity-50"
                >
                  {createProjectMutation.isPending ? "Creating..." : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PROJECT DETAILS MODAL / DRAWER */}
      {selectedProjectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40">
          <div className="w-full max-w-3xl h-full bg-white shadow-2xl flex flex-col overflow-hidden animate-slide-left">
            {detailQuery.isLoading || !detailQuery.data ? (
              <div className="p-12">
                <LoadingState label="Loading project details..." />
              </div>
            ) : (
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="border-b border-pulse-border p-6 bg-pulse-surface flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                        {detailQuery.data.code}
                      </span>
                      <select
                        value={detailQuery.data.status}
                        onChange={(e) => updateStatusMutation.mutate(e.target.value as ProjectStatus)}
                        className="text-xs font-semibold rounded px-2 py-1 border border-pulse-border bg-white text-pulse-ink"
                      >
                        <option value="planning">Planning</option>
                        <option value="active">Active</option>
                        <option value="on_hold">On Hold</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                    <h2 className="mt-2 text-xl font-black text-pulse-ink">{detailQuery.data.name}</h2>
                    <p className="text-xs text-pulse-muted mt-1">
                      Manager: <strong className="text-pulse-ink">{formatPersonName(detailQuery.data.project_manager) || "None"}</strong> ·{" "}
                      Owner: <strong className="text-pulse-ink">{formatPersonName(detailQuery.data.owner_person) || "None"}</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedProjectId(null)}
                    className="text-pulse-muted hover:text-pulse-ink text-2xl font-bold"
                  >
                    &times;
                  </button>
                </div>

                {/* Progress bar banner */}
                <div className="bg-teal-50/60 px-6 py-3 border-b border-teal-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-teal-900">Overall Progress:</span>
                    <div className="w-48 bg-teal-200 rounded-full h-2">
                      <div
                        className="bg-[#0D9488] h-2 rounded-full"
                        style={{ width: `${detailQuery.data.progress_percentage}%` }}
                      />
                    </div>
                    <span className="font-bold text-teal-900">{detailQuery.data.progress_percentage}%</span>
                  </div>
                  {onOpenCreateTaskForProject && (
                    <button
                      type="button"
                      onClick={() => onOpenCreateTaskForProject(detailQuery.data.id)}
                      className="rounded bg-[#0D9488] px-3 py-1 font-semibold text-white hover:bg-[#0f766e]"
                    >
                      + Add Task
                    </button>
                  )}
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Milestones Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-pulse-ink uppercase tracking-wider">
                        Milestones ({detailQuery.data.milestones.length})
                      </h3>
                    </div>

                    <div className="space-y-2">
                      {detailQuery.data.milestones.map((m) => (
                        <div
                          key={m.id}
                          className="rounded-lg border border-pulse-border p-3 flex items-center justify-between bg-white text-xs"
                        >
                          <div>
                            <span className="font-semibold text-pulse-ink">{m.title}</span>
                            {m.description && <p className="text-pulse-muted text-[11px] mt-0.5">{m.description}</p>}
                          </div>
                          <div className="text-right">
                            <span className="font-medium text-pulse-muted">Due: {m.due_date || "No date"}</span>
                            <div className="text-[11px] font-bold text-teal-700 capitalize">{m.status}</div>
                          </div>
                        </div>
                      ))}

                      {canManage && (
                        <div className="rounded-lg border border-dashed border-pulse-border p-3 bg-pulse-surface space-y-2">
                          <p className="text-xs font-semibold text-pulse-ink">Add New Milestone</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              placeholder="Milestone title..."
                              value={milestoneTitle}
                              onChange={(e) => setMilestoneTitle(e.target.value)}
                              className="rounded border border-pulse-border px-2.5 py-1.5 text-xs focus:outline-none"
                            />
                            <input
                              type="date"
                              value={milestoneDate}
                              onChange={(e) => setMilestoneDate(e.target.value)}
                              className="rounded border border-pulse-border px-2.5 py-1.5 text-xs focus:outline-none"
                            />
                          </div>
                          <button
                            type="button"
                            disabled={!milestoneTitle.trim() || addMilestoneMutation.isPending}
                            onClick={() => addMilestoneMutation.mutate()}
                            className="rounded bg-teal-700 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                          >
                            Add Milestone
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tasks Section */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-pulse-ink uppercase tracking-wider">
                      Tasks ({(detailQuery.data.tasks || []).length})
                    </h3>
                    <div className="space-y-1.5">
                      {(detailQuery.data.tasks || []).map((t: TaskSummary) => (
                        <div
                          key={t.id}
                          onClick={() => onOpenTaskDetail(t.id)}
                          className="cursor-pointer rounded-lg border border-pulse-border p-3 hover:border-teal-500 bg-white flex items-center justify-between text-xs transition"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-teal-800 font-bold">{t.code}</span>
                            <span className="font-semibold text-pulse-ink">{t.title}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-pulse-muted">
                              {t.assignee?.name || "Unassigned"}
                            </span>
                            <span className="rounded bg-pulse-hover px-2 py-0.5 text-[11px] font-semibold capitalize">
                              {t.status.replace("_", " ")}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Project Members */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-pulse-ink uppercase tracking-wider">
                      Team Members ({detailQuery.data.members.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {detailQuery.data.members.map((mem) => (
                        <div
                          key={mem.id}
                          className="rounded-lg border border-pulse-border p-2.5 flex items-center justify-between bg-white text-xs"
                        >
                          <div>
                            <span className="font-semibold text-pulse-ink">{mem.name || mem.person?.name || "Member"}</span>
                            <div className="text-[11px] text-pulse-muted">
                              {mem.role_label || mem.role}
                            </div>
                          </div>
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => removeMemberMutation.mutate(mem.id)}
                              className="text-rose-600 hover:text-rose-800 font-bold text-xs"
                              title="Remove member"
                            >
                              &times;
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-2 pt-2">
                        <select
                          value={memberPersonId}
                          onChange={(e) => setMemberPersonId(e.target.value)}
                          className="flex-1 rounded border border-pulse-border px-2.5 py-1 text-xs"
                        >
                          <option value="">Select person to add...</option>
                          {people.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.first_name} {p.last_name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="Role (e.g. Lead Dev)"
                          value={memberRole}
                          onChange={(e) => setMemberRole(e.target.value)}
                          className="w-32 rounded border border-pulse-border px-2 py-1 text-xs"
                        />
                        <input
                          type="number"
                          min="10"
                          max="100"
                          title="Allocation %"
                          value={memberAllocation}
                          onChange={(e) => setMemberAllocation(parseInt(e.target.value, 10) || 100)}
                          className="w-16 rounded border border-pulse-border px-2 py-1 text-xs"
                        />
                        <button
                          type="button"
                          disabled={!memberPersonId || addMemberMutation.isPending}
                          onClick={() => addMemberMutation.mutate()}
                          className="rounded bg-teal-700 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Audit / Activity Log */}
                  <div className="space-y-2 border-t border-pulse-border pt-4">
                    <h3 className="text-xs font-bold text-pulse-muted uppercase tracking-wider">
                      Recent Activity
                    </h3>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {(detailQuery.data.activity || []).map((act) => (
                        <div key={act.id} className="text-[11px] text-pulse-muted flex items-start gap-2">
                          <span className="font-semibold text-pulse-ink">{act.actor_name || "System"}:</span>
                          <span>{act.summary}</span>
                          <span className="ml-auto text-gray-400">
                            {new Date(act.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
