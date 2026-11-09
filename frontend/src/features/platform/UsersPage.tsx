import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import type { CurrentUser, PlatformPermission, PlatformRoleSummary, UserList, UserRow } from "../../shared/api/types";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { DataTable } from "../../shared/ui/DataTable";
import { SelectField, TextField } from "../../shared/ui/Fields";
import { Modal } from "../../shared/ui/Modal";
import { Pagination } from "../../shared/ui/Pagination";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";
import { PlatformGrantCheckboxes } from "./PlatformGrantCheckboxes";

const PAGE_SIZE = 25;

export function UsersPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(params.get("status") ?? "all");
  const [roleFilter, setRoleFilter] = useState(params.get("role") ?? "");
  const [page, setPage] = useState(1);

  // Invite Operator Modal state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [showAdvancedOverrides, setShowAdvancedOverrides] = useState(false);
  const [customOverrides, setCustomOverrides] = useState<string[]>([]);
  const [inviteError, setInviteError] = useState("");
  const [inviteNotice, setInviteNotice] = useState("");

  const me = useQuery({ queryKey: ["me"], queryFn: () => api<CurrentUser>("/api/v1/auth/me/") });
  const isSuperAdmin = Boolean(me.data?.is_super_admin);
  const selfId = me.data?.id;

  const rolesQuery = useQuery({
    queryKey: ["platform-roles-list"],
    queryFn: () => api<{ results: PlatformRoleSummary[] }>("/api/v1/platform/roles/?page_size=100"),
  });

  const catalog = useQuery({
    queryKey: ["platform-permissions"],
    queryFn: () => api<{ results: PlatformPermission[] }>("/api/v1/platform/permissions/"),
  });

  const queryString = useMemo(() => {
    const next = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), sort: "-created_at" });
    if (submittedSearch) next.set("q", submittedSearch);
    if (statusFilter && statusFilter !== "all") next.set("status", statusFilter);
    if (roleFilter) next.set("role", roleFilter);
    next.set("has_platform_grants", "yes");
    return next.toString();
  }, [page, roleFilter, statusFilter, submittedSearch]);

  const users = useQuery({
    queryKey: ["platform-users", queryString],
    queryFn: () => api<UserList>(`/api/v1/platform/users/?${queryString}`),
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      api<{ id: string; email: string }>("/api/v1/platform/invitations/", {
        method: "POST",
        body: JSON.stringify({
          email: inviteEmail.trim(),
          first_name: inviteFirstName.trim(),
          last_name: inviteLastName.trim(),
          role_id: selectedRoleId,
          custom_permissions: showAdvancedOverrides ? customOverrides : [],
        }),
      }),
    onSuccess: (data) => {
      setInviteError("");
      setInviteNotice(`Invitation sent to ${data.email}. Single-use activation link expires in 7 days.`);
      setInviteOpen(false);
      setInviteEmail("");
      setInviteFirstName("");
      setInviteLastName("");
      setSelectedRoleId("");
      setCustomOverrides([]);
      setShowAdvancedOverrides(false);
      queryClient.invalidateQueries({ queryKey: ["platform-users"] });
      queryClient.invalidateQueries({ queryKey: ["platform-roles"] });
    },
    onError: (error) => {
      setInviteError(error instanceof ApiError ? error.message : "The invitation could not be sent.");
    },
  });

  const resendInvitation = useMutation({
    mutationFn: (invitationId: string) =>
      api<void>(`/api/v1/platform/invitations/${invitationId}/resend/`, { method: "POST" }),
    onSuccess: () => {
      setInviteNotice("Invitation email resent with a new activation token.");
      queryClient.invalidateQueries({ queryKey: ["platform-users"] });
    },
    onError: (err) => {
      setInviteNotice(err instanceof ApiError ? err.message : "Failed to resend invitation.");
    },
  });

  const revokeInvitation = useMutation({
    mutationFn: (invitationId: string) =>
      api<void>(`/api/v1/platform/invitations/${invitationId}/revoke/`, { method: "POST" }),
    onSuccess: () => {
      setInviteNotice("Invitation revoked.");
      queryClient.invalidateQueries({ queryKey: ["platform-users"] });
    },
    onError: (err) => {
      setInviteNotice(err instanceof ApiError ? err.message : "Failed to revoke invitation.");
    },
  });

  const selectedRole = rolesQuery.data?.results.find((r) => r.id === selectedRoleId);

  function openInvite() {
    setInviteError("");
    setInviteEmail("");
    setInviteFirstName("");
    setInviteLastName("");
    const defaultRole = rolesQuery.data?.results[0];
    setSelectedRoleId(defaultRole?.id ?? "");
    setCustomOverrides([]);
    setShowAdvancedOverrides(false);
    setInviteOpen(true);
  }

  return (
    <section className="space-y-5">
      <Breadcrumbs items={["Platform", "Access Management", "Platform Operators"]} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Platform Operators</h1>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {users.data?.count ?? 0} total
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Pulse platform staff with dynamically created platform roles and authorization grants. Exactly one Super Admin governs the platform.
          </p>
          {inviteNotice ? (
            <div className="mt-2.5 rounded-md bg-teal-50 border border-teal-200 p-2 text-sm text-teal-800 dark:bg-teal-950/70 dark:border-teal-800 dark:text-teal-200 flex items-center justify-between">
              <span>{inviteNotice}</span>
              <button type="button" onClick={() => setInviteNotice("")} className="text-xs underline ml-2">Dismiss</button>
            </div>
          ) : null}
        </div>

        {isSuperAdmin ? (
          <Button type="button" onClick={openInvite}>
            + Invite platform operator
          </Button>
        ) : (
          <span
            className="text-xs text-slate-500 py-1.5 px-3 border border-slate-200 dark:border-slate-800 rounded-md bg-slate-50 dark:bg-slate-900"
            title="Only the single Super Admin can invite and assign platform roles."
          >
            Only Super Admin can invite operators
          </span>
        )}
      </div>

      {/* Filter and Search Bar */}
      <form
        className="grid gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:grid-cols-[1fr_12rem_14rem_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSubmittedSearch(search.trim());
        }}
      >
        <TextField
          label="Search operators"
          name="q"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, email, or role"
        />
        <SelectField
          label="Account Status"
          name="status"
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="pending">Pending invitations</option>
          <option value="deactivated">Deactivated</option>
        </SelectField>
        <SelectField
          label="Platform Role"
          name="role"
          value={roleFilter}
          onChange={(event) => {
            setRoleFilter(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All roles</option>
          {rolesQuery.data?.results.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </SelectField>
        <div className="flex items-end">
          <Button type="submit">Filter</Button>
        </div>
      </form>

      {users.isLoading ? <LoadingState label="Loading platform operators" /> : null}
      {users.error ? (
        <ErrorState
          title="Operators could not be loaded"
          body={users.error instanceof ApiError ? users.error.message : "The platform API returned an error."}
          action={<Button type="button" variant="secondary" onClick={() => users.refetch()}>Try again</Button>}
        />
      ) : null}

      {users.data && users.data.count === 0 ? (
        <EmptyState
          title="No platform operators found"
          body="No operators match your search or filter criteria."
          action={
            isSuperAdmin ? (
              <Button type="button" onClick={openInvite}>
                Invite operator
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {users.data && users.data.results.length > 0 ? (
        <>
          <DataTable columns={["Operator / Email", "Name", "Assigned Platform Role", "Account Status", "MFA", "Last Login", "Created", "Actions"]}>
            {users.data.results.map((row: UserRow) => {
              const isRowSuperAdmin = Boolean(row.is_super_admin);
              const isCurrentMe = row.id === selfId;
              const isPending = row.status === "pending" || Boolean(row.is_invitation);

              return (
                <tr
                  key={row.id}
                  className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${!isPending ? "cursor-pointer" : ""}`}
                  onClick={() => {
                    if (!isPending) navigate(`/platform/users/${row.id}`);
                  }}
                >
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                    <div className="flex items-center gap-2">
                      {!isPending ? (
                        <Link
                          className="text-teal-800 hover:underline dark:text-teal-300 font-semibold"
                          to={`/platform/users/${row.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.email}
                        </Link>
                      ) : (
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{row.email}</span>
                      )}
                      {isCurrentMe ? (
                        <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-xs font-semibold text-teal-900 dark:bg-teal-950 dark:text-teal-200 border border-teal-200 dark:border-teal-800">
                          You
                        </span>
                      ) : null}
                    </div>
                  </td>

                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {[row.first_name, row.last_name].filter(Boolean).join(" ") || "—"}
                  </td>

                  <td className="px-4 py-3">
                    {isRowSuperAdmin ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-800 border border-violet-200 dark:bg-violet-950/60 dark:border-violet-800 dark:text-violet-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-violet-600"></span>
                        Super Admin (Protected)
                      </span>
                    ) : row.role ? (
                      <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-800 border border-teal-200 dark:bg-teal-950/50 dark:border-teal-800 dark:text-teal-300">
                        {row.role.name}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 italic">No role assigned</span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {isRowSuperAdmin ? (
                      <StatusBadge status="active" />
                    ) : row.status === "suspended" ? (
                      <span
                        className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-300"
                        title={row.status_reason || "Suspended"}
                      >
                        Suspended
                      </span>
                    ) : isPending ? (
                      <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-800 border border-sky-200 dark:bg-sky-950/60 dark:border-sky-800 dark:text-sky-300">
                        Pending invitation
                      </span>
                    ) : (
                      <StatusBadge status={row.status === "deactivated" || !row.is_active ? "inactive" : "active"} />
                    )}
                  </td>

                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {row.mfa_status || "Disabled"}
                  </td>

                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                    {row.last_login ? new Date(row.last_login).toLocaleString() : "Never"}
                  </td>

                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"}
                  </td>

                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      {!isPending ? (
                        <Link
                          className="text-sm font-medium text-teal-800 hover:underline dark:text-teal-300"
                          to={`/platform/users/${row.id}`}
                        >
                          {isRowSuperAdmin ? "View" : "Edit / Manage"}
                        </Link>
                      ) : isSuperAdmin ? (
                        <>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={resendInvitation.isPending}
                            onClick={() => resendInvitation.mutate(row.id)}
                          >
                            Resend
                          </Button>
                          <ConfirmDialog
                            title="Revoke this invitation?"
                            body="The invitation token will be immediately invalidated and cannot be used."
                            confirmLabel="Revoke"
                            trigger={
                              <Button type="button" variant="secondary" disabled={revokeInvitation.isPending}>
                                Revoke
                              </Button>
                            }
                            onConfirm={() => revokeInvitation.mutate(row.id)}
                          />
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">Pending</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </DataTable>
          <Pagination page={users.data.page} pageCount={users.data.page_count} onPageChange={setPage} />
        </>
      ) : null}

      {/* Invite Operator Dialog */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite Platform Operator"
        description="Select a dynamically created platform role. Secure single-use invitation tokens expire in 7 days."
        wide
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={inviteMutation.isPending || !inviteEmail.trim() || !selectedRoleId}
              onClick={() => {
                setInviteError("");
                inviteMutation.mutate();
              }}
            >
              {inviteMutation.isPending ? "Sending invitation…" : "Send invitation"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Email address"
            name="email"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="operator@pulse.local"
            required
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="First name"
              name="first_name"
              value={inviteFirstName}
              onChange={(e) => setInviteFirstName(e.target.value)}
            />
            <TextField
              label="Last name"
              name="last_name"
              value={inviteLastName}
              onChange={(e) => setInviteLastName(e.target.value)}
            />
          </div>

          <div>
            <SelectField
              label="Select Platform Role"
              name="role_id"
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
              required
            >
              <option value="" disabled>
                -- Choose a dynamic role --
              </option>
              {rolesQuery.data?.results.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name} ({role.permission_codes?.length ?? 0} permissions)
                </option>
              ))}
            </SelectField>

            {selectedRole ? (
              <div className="mt-2.5 rounded-lg border border-teal-200 bg-teal-50/60 p-3 dark:border-teal-900 dark:bg-teal-950/30">
                <p className="text-xs font-semibold tracking-wide text-teal-900 uppercase dark:text-teal-200">
                  Role Description & Inherited Permissions
                </p>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                  {selectedRole.description || "No specific description."}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedRole.permission_codes?.map((code) => (
                    <span
                      key={code}
                      className="rounded bg-teal-100/80 px-2 py-0.5 text-xs font-medium text-teal-800 dark:bg-teal-900 dark:text-teal-200"
                    >
                      {code.replace(/^platform\./, "")}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Optional Advanced Permission Overrides */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
            <button
              type="button"
              className="text-xs font-semibold text-teal-800 dark:text-teal-300 hover:underline flex items-center gap-1"
              onClick={() => setShowAdvancedOverrides(!showAdvancedOverrides)}
            >
              {showAdvancedOverrides ? "▼ Hide optional advanced permission overrides" : "► Show optional advanced permission overrides"}
            </button>

            {showAdvancedOverrides ? (
              <div className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <p className="mb-2 text-xs text-slate-500">
                  Assign individual permission grants in addition to the inherited role permissions:
                </p>
                <PlatformGrantCheckboxes
                  catalog={catalog.data?.results ?? []}
                  selected={customOverrides}
                  onChange={setCustomOverrides}
                />
              </div>
            ) : null}
          </div>

          {inviteError ? <p className="text-sm text-rose-700 dark:text-rose-400">{inviteError}</p> : null}
        </div>
      </Modal>
    </section>
  );
}
