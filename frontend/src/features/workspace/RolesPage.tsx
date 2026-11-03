import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { Modal } from "../../shared/ui/Modal";
import { LoadingState } from "../../shared/ui/States";
import type { WorkspacePayload } from "./types";

type Role = {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  is_owner_role: boolean;
  permissions: string[];
  permission_count: number | null;
  user_count: number;
  updated_at: string;
};
type Catalog = { code: string; description: string; module_slug: string | null };
type RoleList = {
  results: Role[];
  catalog: Catalog[];
  installed_modules?: string[];
  caller_holds_owner_role: boolean;
};
type RoleMember = { membership_id: string; email: string; name: string; status: string };
type RoleMembersPayload = {
  results: RoleMember[];
  available: RoleMember[];
  caller_holds_owner_role: boolean;
  role: { id: string; name: string; is_owner_role: boolean };
};

const GROUPS: Array<{ title: string; detail: string; items: Array<[string, string]> }> = [
  {
    title: "People",
    detail: "Person identities, profiles, invitations, and membership.",
    items: [
      ["people.view", "View"],
      ["people.create", "Create"],
      ["people.update", "Update"],
      ["people.deactivate", "Deactivate"],
      ["membership.view", "View memberships"],
      ["membership.invite", "Invite"],
      ["membership.update", "Suspend or reactivate"],
      ["membership.remove", "Remove"],
    ],
  },
  {
    title: "Organization",
    detail: "Organization tree and units.",
    items: [
      ["departments.view", "View"],
      ["departments.manage", "Manage"],
    ],
  },
  {
    title: "Configuration",
    detail: "Workspace settings and roles.",
    items: [
      ["company.view", "View workspace"],
      ["company.update", "Update workspace"],
      ["roles.view", "View roles"],
      ["roles.manage", "Manage roles"],
    ],
  },
  {
    title: "Admin Studio",
    detail: "Dashboards assigned to roles.",
    items: [
      ["dashboards.view", "View"],
      ["dashboards.manage", "Manage dashboards"],
    ],
  },
  {
    title: "Audit",
    detail: "Immutable audit records.",
    items: [["audit.view", "View"]],
  },
  {
    title: "Modules",
    detail: "Optional module catalog and lifecycle.",
    items: [
      ["modules.view", "View modules"],
      ["modules.install", "Install modules"],
      ["modules.configure", "Configure modules"],
      ["modules.uninstall", "Uninstall modules"],
    ],
  },
  {
    title: "Billing & Plan",
    detail: "Company subscription and billing profile.",
    items: [
      ["billing.view", "View subscription"],
      ["billing.manage", "Manage billing"],
    ],
  },
  {
    title: "Parties",
    detail: "Customers, suppliers, and external contacts.",
    items: [
      ["parties.view", "View external parties"],
      ["parties.manage", "Create and update external parties"],
    ],
  },
  {
    title: "Custom Entities",
    detail: "Custom data tables and entity records.",
    items: [
      ["custom_entities.view", "List and view records"],
      ["custom_entities.create", "Create records"],
      ["custom_entities.update", "Update records"],
      ["custom_entities.delete", "Archive records"],
      ["custom_entities.manage", "Manage schemas and fields"],
    ],
  },
  {
    title: "CRM",
    detail: "Leads, customer pipelines, and account records.",
    items: [
      ["crm.view", "View CRM leads and accounts"],
      ["crm.manage", "Create and convert CRM leads and accounts"],
    ],
  },
  {
    title: "Projects",
    detail: "Projects, milestones, and task workflows.",
    items: [
      ["projects.view", "View projects and tasks"],
      ["projects.manage", "Create and update projects"],
      ["projects.task.manage", "Create and assign tasks"],
      ["projects.task.status", "Update status and comments"],
      ["projects.timesheet.log", "Log timesheet hours"],
      ["projects.timesheet.approve", "Review and approve timesheets"],
      ["projects.reports.view", "View project reports"],
      ["projects.admin", "Manage project settings"],
    ],
  },
  {
    title: "HRMS – Workforce",
    detail: "Employee directory, work locations, reporting lines, and HR setup.",
    items: [
      ["hrms.employee.view", "View employee records"],
      ["hrms.employee.manage", "Create and update employment records"],
      ["hrms.location.manage", "Manage work locations"],
      ["hrms.reporting.manage", "Manage reporting relationships"],
      ["hrms.activation.view", "View HRMS setup readiness"],
      ["hrms.activation.manage", "Configure and activate HRMS features"],
    ],
  },
  {
    title: "Leave",
    detail: "Leave requests when HRMS is available.",
    items: [
      ["hrms.leave.view", "View"],
      ["hrms.leave.request", "Request own"],
      ["hrms.leave.decide", "Decide"],
    ],
  },
  {
    title: "HRMS – Attendance",
    detail: "Attendance check-in, tracking, schedules, and corrections.",
    items: [
      ["hrms.attendance.check_in", "Record check-in"],
      ["hrms.attendance.check_out", "Record check-out"],
      ["hrms.attendance.view", "View attendance records"],
      ["hrms.attendance.manage", "Manage company attendance schedules"],
      ["hrms.attendance.correction.approve", "Approve attendance corrections"],
      ["hrms.attendance.evidence.view", "View verification evidence"],
    ],
  },
  {
    title: "HRMS – Compensation & Payroll",
    detail: "Salaries, compensation, payroll runs, and payslips.",
    items: [
      ["hrms.compensation.own.view", "View own compensation"],
      ["hrms.compensation.view", "View authorized compensation"],
      ["hrms.compensation.manage", "Manage employee compensation"],
      ["hrms.payroll.view", "View payroll data"],
      ["hrms.payroll.calculate", "Calculate payroll runs"],
      ["hrms.payroll.approve", "Approve submitted payroll runs"],
      ["hrms.payroll.finalize", "Finalize approved payroll runs"],
      ["hrms.payroll.reverse", "Reverse finalized payroll runs"],
      ["hrms.payroll.payment_status", "Record payment status"],
      ["hrms.payroll.payslip.own", "View own payslips"],
      ["hrms.payroll.payslip.view", "View authorized payslips"],
    ],
  },
  {
    title: "HRMS – Documents",
    detail: "Employee records and sensitive identity documents.",
    items: [
      ["hrms.documents.view", "View employee documents"],
      ["hrms.documents.manage", "Manage employee documents"],
      ["hrms.documents.sensitive.view", "View sensitive identity documents"],
    ],
  },
  {
    title: "Commerce – Products",
    detail: "Product catalog, categories, pricing, and inventory.",
    items: [
      ["commerce.view.products", "View product catalog"],
      ["commerce.create.products", "Create products and categories"],
      ["commerce.update.products", "Update products and stock"],
      ["commerce.archive.products", "Archive and delete products"],
      ["commerce.manage.categories", "Manage product categories"],
      ["commerce.manage.pricing", "Manage price lists and custom pricing"],
    ],
  },
  {
    title: "Commerce – Orders & Operations",
    detail: "Sales orders, fulfillment, customer management, and operations.",
    items: [
      ["commerce.view", "View commerce products and orders"],
      ["commerce.manage", "Create commerce products and orders"],
      ["commerce.view.dashboard", "View overview dashboard and analytics"],
      ["commerce.view.orders", "View sales orders"],
      ["commerce.create.orders", "Create sales orders"],
      ["commerce.update.orders", "Edit draft orders"],
      ["commerce.confirm.orders", "Confirm and fulfill orders"],
      ["commerce.cancel.orders", "Cancel orders and restock items"],
      ["commerce.manage.customers", "Manage commerce customers"],
      ["commerce.manage.vendors", "Manage vendors and suppliers"],
      ["commerce.manage.discounts", "Create and manage discounts"],
      ["commerce.manage.returns", "Manage returns and refund approvals"],
      ["commerce.view.reports", "View sales reports"],
      ["commerce.manage.settings", "Configure commerce settings"],
    ],
  },
];

const SENSITIVE = new Set([
  "membership.remove",
  "people.deactivate",
  "audit.view",
  "billing.manage",
  "roles.manage",
  "hrms.compensation.view",
  "hrms.compensation.manage",
  "hrms.payroll.finalize",
  "hrms.payroll.reverse",
  "hrms.documents.sensitive.view",
  "hrms.attendance.evidence.view",
]);

function errorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return "The request failed.";
  return error.details[0]?.message || error.message;
}

export function RolesPage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const queryClient = useQueryClient();
  const canManage = workspace.permissions.includes("roles.manage");
  const canViewRoles = workspace.permissions.includes("roles.view") || canManage;
  const roles = useQuery({
    queryKey: ["roles", companyId],
    queryFn: () => api<RoleList>(`/api/v1/companies/${companyId}/roles/`),
  });
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const [membersRole, setMembersRole] = useState<Role | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [formError, setFormError] = useState("");

  const catalog = useMemo(() => new Map((roles.data?.catalog ?? []).map((item) => [item.code, item])), [roles.data]);
  const known = useMemo(() => new Set(GROUPS.flatMap((group) => group.items.map(([code]) => code))), []);
  const extras = useMemo(() => {
    return (roles.data?.catalog ?? []).filter((item) => !known.has(item.code));
  }, [roles.data, known]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["roles", companyId] });
    await queryClient.invalidateQueries({ queryKey: ["people", companyId] });
    await queryClient.invalidateQueries({ queryKey: ["memberships", companyId] });
  };
  const save = useMutation({
    mutationFn: async () => {
      if (editing === "new") {
        const created = await api<Role>(`/api/v1/companies/${companyId}/roles/`, {
          method: "POST",
          body: JSON.stringify({ name, description }),
        });
        await api(`/api/v1/companies/${companyId}/roles/${created.id}/`, {
          method: "PATCH",
          body: JSON.stringify({ permissions: selected }),
        });
        return;
      }
      if (!editing || editing.is_owner_role) return;
      await api(`/api/v1/companies/${companyId}/roles/${editing.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editing.is_system ? undefined : name,
          description,
          permissions: selected,
        }),
      });
    },
    onSuccess: async () => {
      setEditing(null);
      setFormError("");
      await refresh();
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  function openCreate() {
    setReadOnly(false);
    setEditing("new");
    setName("");
    setDescription("");
    setSelected(["company.view"]);
    setFormError("");
  }

  function openEdit(role: Role, viewing = false) {
    if (role.is_owner_role) return;
    setReadOnly(viewing);
    setEditing(role);
    setName(role.name);
    setDescription(role.description);
    setSelected(role.permissions);
    setFormError("");
  }

  function toggle(code: string) {
    setSelected((current) => (current.includes(code) ? current.filter((item) => item !== code) : [...current, code]));
  }

  if (roles.isLoading || !roles.data) {
    return <LoadingState label="Loading roles" />;
  }

  if (editing) {
    const lockedName = editing !== "new" && editing.is_system;
    return (
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!readOnly) save.mutate(); }}>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{editing === "new" ? "Create role" : readOnly ? name : "Edit role"}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Define what members of this company role can do. Dashboards and navigation never grant access.</p>
        </div>
        <section className="grid gap-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 md:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Role name *
            <input className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm" placeholder="e.g. Finance Analyst" value={name} onChange={(event) => setName(event.target.value)} required disabled={lockedName || readOnly} />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Description <span className="font-normal text-slate-400">Optional</span>
            <input className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm" value={description} onChange={(event) => setDescription(event.target.value)} disabled={readOnly} />
          </label>
        </section>
        <section className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Permissions</div>
          {GROUPS.map((group) => {
            const items = group.items.filter(([code]) => catalog.has(code));
            if (items.length === 0) return null;
            return (
              <div key={group.title} className="grid gap-3 border-b border-slate-100 dark:border-slate-800 px-4 py-3 md:grid-cols-[16rem_1fr] last:border-b-0">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{group.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{group.detail}</p>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {items.map(([code, label]) => (
                    <label key={code} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300" title={catalog.get(code)?.description}>
                      <input type="checkbox" checked={selected.includes(code)} onChange={() => toggle(code)} disabled={readOnly} />
                      {label}
                      {SENSITIVE.has(code) ? <span className="text-amber-600 font-bold" title="Sensitive">!</span> : null}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          {extras.length ? (
            <div className="grid gap-3 px-4 py-3 md:grid-cols-[16rem_1fr]">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Other</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Additional company permissions.</p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {extras.map((item) => (
                  <label key={item.code} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300" title={item.description}>
                    <input type="checkbox" checked={selected.includes(item.code)} onChange={() => toggle(item.code)} disabled={readOnly} />
                    {item.description}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </section>
        {formError ? <p className="text-sm text-rose-700">{formError}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">{selected.length} permissions selected</p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>{readOnly ? "Close" : "Cancel"}</Button>
            {readOnly ? null : <Button type="submit" disabled={save.isPending || !name.trim()}>{editing === "new" ? "Create role" : "Save role"}</Button>}
          </div>
        </div>
      </form>
    );
  }

  const rows = roles.data.results.filter((role) => !role.is_owner_role);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Roles & Permissions</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Roles are defined by your company. Add people to a role from Members, or edit permissions for what that role can do.</p>
        </div>
        {canManage ? <Button type="button" onClick={openCreate}>+ Create role</Button> : null}
      </div>
      <div className="flex gap-5 border-b border-slate-200 dark:border-slate-700 text-sm">
        <button type="button" className={`border-b-2 px-0.5 pb-2 ${tab === "active" ? "border-teal-800 font-medium text-slate-900 dark:text-slate-100" : "border-transparent text-slate-500 dark:text-slate-400"}`} onClick={() => setTab("active")}>Active <span className="ml-1 text-slate-400">{rows.length}</span></button>
        <button type="button" className={`border-b-2 px-0.5 pb-2 ${tab === "archived" ? "border-teal-800 font-medium text-slate-900 dark:text-slate-100" : "border-transparent text-slate-500 dark:text-slate-400"}`} onClick={() => setTab("archived")}>Archived <span className="ml-1 text-slate-400">0</span></button>
      </div>
      {tab === "archived" ? (
        <p className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-10 text-sm text-slate-500 dark:text-slate-400">No archived roles.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Members</th>
                  <th className="px-4 py-3 font-medium">Permissions</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last updated</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((role) => (
                  <tr key={role.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/70">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{role.name}</p>
                      <p className="mt-0.5 max-w-md text-xs text-slate-500 dark:text-slate-400">{role.description || "Custom role"}</p>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                      {canViewRoles ? (
                        <button type="button" className="font-medium text-teal-800 hover:underline" onClick={() => setMembersRole(role)}>
                          {role.user_count}
                        </button>
                      ) : (
                        role.user_count
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">{role.permission_count ?? role.permissions.length}</td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">{updatedLabel(role.updated_at)}</td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center justify-end gap-0.5 text-slate-400">
                        {canViewRoles ? (
                          <IconButton label="Members" onClick={() => setMembersRole(role)}>
                            <circle cx="7" cy="7" r="2.5" />
                            <circle cx="13" cy="7" r="2.5" />
                            <path d="M3.5 15c.8-2 2.2-3 3.5-3s2.7 1 3.5 3" />
                            <path d="M9.5 15c.8-2 2.2-3 3.5-3s2.7 1 3.5 3" />
                          </IconButton>
                        ) : null}
                        <IconButton label="Edit" onClick={() => openEdit(role)}>
                          <path d="M4 13.5V16h2.5L14.8 7.7l-2.5-2.5L4 13.5Z" />
                          <path d="m11.5 6 2.5 2.5" />
                        </IconButton>
                        {canManage ? (
                          <IconButton label="Duplicate" onClick={() => api(`/api/v1/companies/${companyId}/roles/${role.id}/duplicate/`, { method: "POST" }).then(refresh)}>
                            <rect x="7" y="7" width="9" height="9" rx="1.5" />
                            <path d="M5 12.5V5.5A1.5 1.5 0 0 1 6.5 4H13" />
                          </IconButton>
                        ) : null}
                        <IconButton label="View" onClick={() => openEdit(role, true)}>
                          <path d="M2.5 10S5.5 5 10 5s7.5 5 7.5 5-3 5-7.5 5S2.5 10 2.5 10Z" />
                          <circle cx="10" cy="10" r="2" />
                        </IconButton>
                        {canManage && !role.is_system ? (
                          <IconButton label="Archive" onClick={() => api(`/api/v1/companies/${companyId}/roles/${role.id}/`, { method: "DELETE" }).then(refresh).catch((error) => setFormError(errorMessage(error)))}>
                            <path d="M4.5 6.5h11" />
                            <path d="M8 6.5V5h4v1.5" />
                            <path d="M6.5 6.5 7 15h6l.5-8.5" />
                          </IconButton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {formError ? <p className="px-4 py-2 text-sm text-rose-700">{formError}</p> : null}
          <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:text-slate-400">Permissions are enforced by the server on every request. Hiding navigation or widgets is presentation only.</p>
        </div>
      )}
      {membersRole ? (
        <RoleMembersModal
          companyId={companyId}
          role={membersRole}
          canManage={canManage}
          callerHoldsOwnerRole={Boolean(roles.data?.caller_holds_owner_role)}
          onClose={() => setMembersRole(null)}
          onChanged={refresh}
        />
      ) : null}
    </div>
  );
}

function RoleMembersModal({
  companyId,
  role,
  canManage,
  callerHoldsOwnerRole,
  onClose,
  onChanged,
}: {
  companyId: string;
  role: Role;
  canManage: boolean;
  callerHoldsOwnerRole: boolean;
  onClose: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [actionError, setActionError] = useState("");
  const members = useQuery({
    queryKey: ["role-members", companyId, role.id],
    queryFn: () => api<RoleMembersPayload>(`/api/v1/companies/${companyId}/roles/${role.id}/members/`),
  });
  const refreshMembers = () => members.refetch().then(() => onChanged());

  const addMembers = useMutation({
    mutationFn: (membershipIds: string[]) =>
      api(`/api/v1/companies/${companyId}/roles/${role.id}/members/`, {
        method: "POST",
        body: JSON.stringify({ membership_ids: membershipIds }),
      }),
    onSuccess: async () => {
      setChosen([]);
      setActionError("");
      await refreshMembers();
    },
    onError: (error) => setActionError(errorMessage(error)),
  });
  const removeMember = useMutation({
    mutationFn: (membershipId: string) =>
      api(`/api/v1/companies/${companyId}/roles/${role.id}/members/${membershipId}/`, { method: "DELETE" }),
    onSuccess: async () => {
      setActionError("");
      await refreshMembers();
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const ownerLocked = role.is_owner_role && !callerHoldsOwnerRole && !members.data?.caller_holds_owner_role;
  const canEditMembers = canManage && !ownerLocked;

  function toggleCandidate(id: string) {
    setChosen((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <Modal
      open
      wide
      title={`Members · ${role.name}`}
      description="People with this role inherit its permissions. Adding someone here does not remove their other roles."
      onClose={onClose}
    >
      {members.isLoading ? <LoadingState label="Loading members" /> : null}
      {members.error ? <p className="text-sm text-rose-700">{errorMessage(members.error)}</p> : null}
      {members.data ? (
        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Current members ({members.data.results.length})</h3>
            {members.data.results.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No one holds this role yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                {members.data.results.map((member) => (
                  <li key={member.membership_id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{member.name || member.email}</span>
                      {member.name ? <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{member.email}</span> : null}
                    </span>
                    {canEditMembers ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={removeMember.isPending}
                        onClick={() => removeMember.mutate(member.membership_id)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {canEditMembers ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Add members</h3>
              {members.data.available.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Every active member already has this role.</p>
              ) : (
                <>
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 p-2">
                    {members.data.available.map((member) => (
                      <label key={member.membership_id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                        <input
                          type="checkbox"
                          checked={chosen.includes(member.membership_id)}
                          onChange={() => toggleCandidate(member.membership_id)}
                        />
                        <span>
                          <span className="font-medium text-slate-900 dark:text-slate-100">{member.name || member.email}</span>
                          {member.name ? <span className="ml-2 text-slate-500 dark:text-slate-400">{member.email}</span> : null}
                        </span>
                      </label>
                    ))}
                  </ul>
                  <Button type="button" disabled={chosen.length === 0 || addMembers.isPending} onClick={() => addMembers.mutate(chosen)}>
                    {addMembers.isPending ? "Adding…" : `Add to role${chosen.length ? ` (${chosen.length})` : ""}`}
                  </Button>
                </>
              )}
            </section>
          ) : ownerLocked ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Only an owner can change who holds the owner role.</p>
          ) : null}
          {actionError ? <p className="text-sm text-rose-700">{actionError}</p> : null}
        </div>
      ) : null}
    </Modal>
  );
}

function updatedLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  if (date.toDateString() === new Date().toDateString()) return "Today";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} className="rounded-md p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300" onClick={onClick}>
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}
