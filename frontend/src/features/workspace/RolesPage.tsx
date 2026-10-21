import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
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
type RoleList = { results: Role[]; catalog: Catalog[]; caller_holds_owner_role: boolean };

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
    title: "Leave",
    detail: "Leave requests when HRMS is available.",
    items: [
      ["hrms.leave.view", "View"],
      ["hrms.leave.request", "Request own"],
      ["hrms.leave.decide", "Decide"],
    ],
  },
];

const SENSITIVE = new Set(["membership.remove", "people.deactivate", "audit.view", "billing.manage", "roles.manage"]);

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "The request failed.";
}

export function RolesPage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const queryClient = useQueryClient();
  const canManage = workspace.permissions.includes("roles.manage");
  const roles = useQuery({
    queryKey: ["roles", companyId],
    queryFn: () => api<RoleList>(`/api/v1/companies/${companyId}/roles/`),
  });
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [formError, setFormError] = useState("");

  const catalog = useMemo(() => new Map((roles.data?.catalog ?? []).map((item) => [item.code, item])), [roles.data]);
  const known = new Set(GROUPS.flatMap((group) => group.items.map(([code]) => code)));
  const extras = (roles.data?.catalog ?? []).filter((item) => !known.has(item.code));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["roles", companyId] });
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
          <h1 className="text-2xl font-semibold text-slate-900">{editing === "new" ? "Create role" : readOnly ? name : "Edit role"}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Define what members of this company role can do. Dashboards and navigation never grant access.</p>
        </div>
        <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">Role name *
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. Finance Analyst" value={name} onChange={(event) => setName(event.target.value)} required disabled={lockedName || readOnly} />
          </label>
          <label className="block text-sm font-medium text-slate-700">Description <span className="font-normal text-slate-400">Optional</span>
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={description} onChange={(event) => setDescription(event.target.value)} disabled={readOnly} />
          </label>
        </section>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">Permissions</div>
          {GROUPS.map((group) => {
            const items = group.items.filter(([code]) => catalog.has(code));
            if (items.length === 0) return null;
            return (
              <div key={group.title} className="grid gap-3 border-b border-slate-100 px-4 py-3 md:grid-cols-[16rem_1fr]">
                <div>
                  <p className="text-sm font-medium text-slate-900">{group.title}</p>
                  <p className="text-xs text-slate-500">{group.detail}</p>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {items.map(([code, label]) => (
                    <label key={code} className="flex items-center gap-2 text-sm text-slate-700" title={catalog.get(code)?.description}>
                      <input type="checkbox" checked={selected.includes(code)} onChange={() => toggle(code)} disabled={readOnly} />
                      {label}
                      {SENSITIVE.has(code) ? <span className="text-amber-600" title="Sensitive">!</span> : null}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          {extras.length ? (
            <div className="grid gap-3 px-4 py-3 md:grid-cols-[16rem_1fr]">
              <div>
                <p className="text-sm font-medium text-slate-900">Other</p>
                <p className="text-xs text-slate-500">Additional company permissions.</p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {extras.map((item) => (
                  <label key={item.code} className="flex items-center gap-2 text-sm text-slate-700" title={item.description}>
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
          <p className="text-sm text-slate-500">{selected.length} permissions selected</p>
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
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Roles & Permissions</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Roles are defined by your company. Pulse has no built-in business roles — permissions decide what each role can do.</p>
        </div>
        {canManage ? <Button type="button" onClick={openCreate}>+ Create role</Button> : null}
      </div>
      <div className="flex gap-5 border-b border-slate-200 text-sm">
        <button type="button" className={`border-b-2 px-0.5 pb-2 ${tab === "active" ? "border-teal-800 font-medium text-slate-900" : "border-transparent text-slate-500"}`} onClick={() => setTab("active")}>Active <span className="ml-1 text-slate-400">{rows.length}</span></button>
        <button type="button" className={`border-b-2 px-0.5 pb-2 ${tab === "archived" ? "border-teal-800 font-medium text-slate-900" : "border-transparent text-slate-500"}`} onClick={() => setTab("archived")}>Archived <span className="ml-1 text-slate-400">0</span></button>
      </div>
      {tab === "archived" ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-sm text-slate-500">No archived roles.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Members</th>
                  <th className="px-4 py-3 font-medium">Permissions</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last updated</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((role) => (
                  <tr key={role.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-900">{role.name}</p>
                      <p className="mt-0.5 max-w-md text-xs text-slate-500">{role.description || "Custom role"}</p>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">{role.user_count}</td>
                    <td className="px-4 py-3.5 text-slate-700">{role.permission_count ?? role.permissions.length}</td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500">{updatedLabel(role.updated_at)}</td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center justify-end gap-0.5 text-slate-400">
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
                          <IconButton label="Delete" onClick={() => api(`/api/v1/companies/${companyId}/roles/${role.id}/`, { method: "DELETE" }).then(refresh).catch((error) => setFormError(errorMessage(error)))}>
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
          <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">Permissions are enforced by the server on every request. Hiding navigation or widgets is presentation only.</p>
        </div>
      )}
    </div>
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
    <button type="button" aria-label={label} title={label} className="rounded-md p-1.5 hover:bg-slate-100 hover:text-slate-700" onClick={onClick}>
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}
