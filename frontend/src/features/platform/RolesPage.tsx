import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, ApiError } from "../../shared/api/client";
import type { CurrentUser, PlatformPermission, PlatformRoleSummary } from "../../shared/api/types";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { DataTable } from "../../shared/ui/DataTable";
import { TextField } from "../../shared/ui/Fields";
import { Modal } from "../../shared/ui/Modal";
import { Pagination } from "../../shared/ui/Pagination";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";
import { PlatformGrantCheckboxes } from "./PlatformGrantCheckboxes";

const PAGE_SIZE = 25;

export function RolesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [page, setPage] = useState(1);

  // Create / Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<PlatformRoleSummary | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleSlug, setRoleSlug] = useState("");
  const [roleDesc, setRoleDesc] = useState("");
  const [rolePerms, setRolePerms] = useState<string[]>([]);
  const [modalError, setModalError] = useState("");

  // View operators modal state
  const [viewRole, setViewRole] = useState<PlatformRoleSummary | null>(null);

  const me = useQuery({ queryKey: ["me"], queryFn: () => api<CurrentUser>("/api/v1/auth/me/") });
  const isSuperAdmin = Boolean(me.data?.is_super_admin);

  const queryString = useMemo(() => {
    const next = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), sort: "name" });
    if (submittedSearch) next.set("q", submittedSearch);
    return next.toString();
  }, [page, submittedSearch]);

  const roles = useQuery({
    queryKey: ["platform-roles", queryString],
    queryFn: () => api<{ results: PlatformRoleSummary[]; page: number; page_count: number; count: number }>(`/api/v1/platform/roles/?${queryString}`),
  });

  const catalog = useQuery({
    queryKey: ["platform-permissions"],
    queryFn: () => api<{ results: PlatformPermission[] }>("/api/v1/platform/permissions/"),
  });

  const roleDetail = useQuery({
    queryKey: ["platform-role-detail", viewRole?.id],
    queryFn: () => api<PlatformRoleSummary>(`/api/v1/platform/roles/${viewRole?.id}/`),
    enabled: Boolean(viewRole?.id),
  });

  const saveRole = useMutation({
    mutationFn: () => {
      if (editingRole) {
        return api<PlatformRoleSummary>(`/api/v1/platform/roles/${editingRole.id}/`, {
          method: "PATCH",
          body: JSON.stringify({
            name: roleName.trim(),
            description: roleDesc.trim(),
            permission_codes: rolePerms,
          }),
        });
      }
      return api<PlatformRoleSummary>("/api/v1/platform/roles/", {
        method: "POST",
        body: JSON.stringify({
          name: roleName.trim(),
          slug: roleSlug.trim() || undefined,
          description: roleDesc.trim(),
          permission_codes: rolePerms,
        }),
      });
    },
    onSuccess: () => {
      setModalOpen(false);
      setEditingRole(null);
      setModalError("");
      queryClient.invalidateQueries({ queryKey: ["platform-roles"] });
      queryClient.invalidateQueries({ queryKey: ["platform-users"] });
    },
    onError: (err) => {
      setModalError(err instanceof ApiError ? err.message : "Failed to save role.");
    },
  });

  const deleteRole = useMutation({
    mutationFn: (roleId: string) =>
      api<void>(`/api/v1/platform/roles/${roleId}/`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-roles"] });
    },
  });

  function openCreate() {
    setEditingRole(null);
    setRoleName("");
    setRoleSlug("");
    setRoleDesc("");
    setRolePerms([]);
    setModalError("");
    setModalOpen(true);
  }

  function openEdit(role: PlatformRoleSummary) {
    setEditingRole(role);
    setRoleName(role.name);
    setRoleSlug(role.slug);
    setRoleDesc(role.description || "");
    setRolePerms(role.permission_codes || []);
    setModalError("");
    setModalOpen(true);
  }

  return (
    <section className="space-y-5">
      <Breadcrumbs items={["Platform", "Access Management", "Roles"]} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Dynamic Platform Roles</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Dynamically created platform roles managed by the Super Admin. Predefined generic roles are not permitted.
          </p>
        </div>
        {isSuperAdmin ? (
          <Button type="button" onClick={openCreate}>
            + Create platform role
          </Button>
        ) : null}
      </div>

      <form
        className="flex flex-wrap gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSubmittedSearch(search.trim());
        }}
      >
        <div className="flex-1 min-w-[200px]">
          <TextField
            label="Search roles"
            name="q"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by role name, slug, or description"
          />
        </div>
        <div className="flex items-end">
          <Button type="submit">Search</Button>
        </div>
      </form>

      {roles.isLoading ? <LoadingState label="Loading platform roles" /> : null}
      {roles.error ? (
        <ErrorState
          title="Could not load platform roles"
          body={roles.error instanceof ApiError ? roles.error.message : "API returned an error."}
          action={<Button type="button" variant="secondary" onClick={() => roles.refetch()}>Try again</Button>}
        />
      ) : null}

      {roles.data && roles.data.count === 0 ? (
        <EmptyState
          title="No platform roles found"
          body="No dynamic platform roles have been created yet. As Super Admin, you can create customized roles for your platform operators."
          action={isSuperAdmin ? <Button type="button" onClick={openCreate}>Create first role</Button> : undefined}
        />
      ) : null}

      {roles.data && roles.data.results.length > 0 ? (
        <>
          <DataTable columns={["Role name", "Slug", "Description", "Assigned Operators", "Permissions", "Created", "Actions"]}>
            {roles.data.results.map((role) => {
              const operatorCount = role.assigned_operators_count ?? 0;
              const hasOperators = operatorCount > 0;

              return (
                <tr key={role.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                    <span className="font-semibold text-teal-800 dark:text-teal-300">{role.name}</span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-500 dark:text-slate-400">
                    {role.slug}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 max-w-xs truncate">
                    {role.description || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setViewRole(role)}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                        hasOperators
                          ? "bg-teal-50 border-teal-200 text-teal-800 hover:bg-teal-100 dark:bg-teal-950 dark:border-teal-800 dark:text-teal-200 cursor-pointer"
                          : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700"
                      }`}
                      title={hasOperators ? "Click to view assigned operators" : "No operators assigned"}
                    >
                      {operatorCount} {operatorCount === 1 ? "operator" : "operators"}
                      {hasOperators ? <span className="underline ml-0.5">view</span> : null}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {role.permission_codes?.length ?? 0}
                    </span>{" "}
                    grants
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {role.created_at ? new Date(role.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {isSuperAdmin ? (
                        <>
                          <Button type="button" variant="secondary" onClick={() => openEdit(role)}>
                            Edit
                          </Button>
                          {hasOperators ? (
                            <span
                              className="text-xs text-slate-400 cursor-not-allowed py-1 px-2 border border-slate-200 rounded dark:border-slate-800"
                              title="Cannot delete role while operators are assigned. Reassign operators first."
                            >
                              In use
                            </span>
                          ) : (
                            <ConfirmDialog
                              title={`Delete role "${role.name}"?`}
                              body="This will permanently delete this dynamic role. This action cannot be undone."
                              confirmLabel="Delete role"
                              trigger={
                                <Button type="button" variant="secondary">
                                  Delete
                                </Button>
                              }
                              onConfirm={() => deleteRole.mutate(role.id)}
                            />
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">Read only</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </DataTable>
          <Pagination page={roles.data.page} pageCount={roles.data.page_count} onPageChange={setPage} />
        </>
      ) : null}

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRole ? `Edit role: ${editingRole.name}` : "Create platform role"}
        description="Configure dynamic platform role name, description, and assign permissions from the catalog."
        wide
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saveRole.isPending || !roleName.trim() || rolePerms.length === 0}
              onClick={() => saveRole.mutate()}
            >
              {saveRole.isPending ? "Saving…" : editingRole ? "Save changes" : "Create role"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Role name"
            name="name"
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
            placeholder="e.g. Compliance Auditor, Integration Specialist"
            required
          />
          {!editingRole ? (
            <TextField
              label="Slug (optional, auto-generated from name)"
              name="slug"
              value={roleSlug}
              onChange={(e) => setRoleSlug(e.target.value)}
              placeholder="e.g. compliance-auditor"
            />
          ) : null}
          <TextField
            label="Description"
            name="description"
            value={roleDesc}
            onChange={(e) => setRoleDesc(e.target.value)}
            placeholder="Purpose and responsibilities of operators assigned this role"
          />

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Assigned permissions <span className="text-rose-500">*</span>
              </p>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {rolePerms.length} selected (at least 1 required)
              </span>
            </div>
            {catalog.isLoading ? (
              <p className="text-sm text-slate-500">Loading catalog permissions…</p>
            ) : (
              <PlatformGrantCheckboxes
                catalog={catalog.data?.results ?? []}
                selected={rolePerms}
                onChange={setRolePerms}
              />
            )}
          </div>

          {modalError ? <p className="text-sm text-rose-700 dark:text-rose-400">{modalError}</p> : null}
        </div>
      </Modal>

      {/* View Operators Modal */}
      <Modal
        open={Boolean(viewRole)}
        onClose={() => setViewRole(null)}
        title={`Operators assigned to: ${viewRole?.name}`}
        description="All platform operators currently assigned this platform role."
        wide
        footer={
          <Button type="button" variant="secondary" onClick={() => setViewRole(null)}>
            Close
          </Button>
        }
      >
        <div className="space-y-3">
          {roleDetail.isLoading ? (
            <LoadingState label="Loading operators" />
          ) : roleDetail.data?.assigned_operators && roleDetail.data.assigned_operators.length > 0 ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 border rounded-lg border-slate-200 dark:border-slate-700">
              {roleDetail.data.assigned_operators.map((op) => (
                <li key={op.id} className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{op.email}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {[op.first_name, op.last_name].filter(Boolean).join(" ") || "No name set"}
                      {" · "}
                      Status: <span className="font-medium capitalize">{op.status}</span>
                    </p>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 text-right">
                    Last login: {op.last_login ? new Date(op.last_login).toLocaleDateString() : "Never"}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
              No operators are currently assigned this role.
            </p>
          )}
        </div>
      </Modal>
    </section>
  );
}
