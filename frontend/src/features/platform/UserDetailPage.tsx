import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import type { CurrentUser, PlatformPermission, PlatformRoleSummary, PlatformUserDetail } from "../../shared/api/types";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { SelectField, TextField } from "../../shared/ui/Fields";
import { Modal } from "../../shared/ui/Modal";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { ErrorState, LoadingState } from "../../shared/ui/States";

export function UserDetailPage() {
  const { userId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const me = useQuery({ queryKey: ["me"], queryFn: () => api<CurrentUser>("/api/v1/auth/me/") });
  const isSuperAdmin = Boolean(me.data?.is_super_admin);
  const canManage = isSuperAdmin || Boolean(me.data?.platform_permissions.includes("platform.users.manage"));
  const isSelf = me.data?.id === userId;

  const detail = useQuery({
    queryKey: ["platform-user", userId],
    queryFn: () => api<PlatformUserDetail>(`/api/v1/platform/users/${userId}/`),
    enabled: Boolean(userId),
  });

  const rolesQuery = useQuery({
    queryKey: ["platform-roles-list"],
    queryFn: () => api<{ results: PlatformRoleSummary[] }>("/api/v1/platform/roles/?page_size=100"),
  });

  const catalog = useQuery({
    queryKey: ["platform-permissions"],
    queryFn: () => api<{ results: PlatformPermission[] }>("/api/v1/platform/permissions/"),
  });

  const activityQuery = useQuery({
    queryKey: ["platform-user-activity", userId],
    queryFn: () => api<{ results: Array<{ id: string; action: string; created_at: string; actor_email: string; actor_name: string; before: unknown; after: unknown }> }>(`/api/v1/platform/users/${userId}/activity/`),
    enabled: Boolean(userId),
  });

  // Edit profile state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [customPermissions, setCustomPermissions] = useState<string[]>([]);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  // Lifecycle Dialog states
  const [suspendModalOpen, setSuspendModalOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");

  const [reactivateModalOpen, setReactivateModalOpen] = useState(false);
  const [reactivateReason, setReactivateReason] = useState("");

  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState("");

  // Ownership transfer state
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferPassword, setTransferPassword] = useState("");
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferFallbackRoleId, setTransferFallbackRoleId] = useState("");
  const [transferConfirm, setTransferConfirm] = useState(false);
  const [transferReason, setTransferReason] = useState("");
  const [transferError, setTransferError] = useState("");

  const operatorsQuery = useQuery({
    queryKey: ["platform-operators-all"],
    queryFn: () => api<{ results: Array<{ id: string; email: string; first_name: string; last_name: string; is_super_admin?: boolean }> }>("/api/v1/platform/users/?has_platform_grants=yes&page_size=100"),
    enabled: isSuperAdmin && transferModalOpen,
  });

  useEffect(() => {
    if (!detail.data) return;
    setFirstName(detail.data.first_name || "");
    setLastName(detail.data.last_name || "");
    setSelectedRoleId(detail.data.role?.id || "");
    setCustomPermissions(detail.data.custom_permissions || []);
  }, [detail.data]);

  const save = useMutation({
    mutationFn: () =>
      api<PlatformUserDetail>(`/api/v1/platform/users/${userId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          role_id: selectedRoleId || null,
          custom_permissions: customPermissions,
        }),
      }),
    onSuccess: (data) => {
      setFormError("");
      setNotice("Changes saved successfully.");
      queryClient.setQueryData(["platform-user", userId], data);
      queryClient.invalidateQueries({ queryKey: ["platform-users"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error) => {
      setNotice("");
      setFormError(error instanceof ApiError ? error.message : "Could not save changes.");
    },
  });

  const suspendMutation = useMutation({
    mutationFn: () =>
      api<PlatformUserDetail>(`/api/v1/platform/users/${userId}/suspend/`, {
        method: "POST",
        body: JSON.stringify({ reason: suspendReason.trim() }),
      }),
    onSuccess: (data) => {
      setSuspendModalOpen(false);
      setSuspendReason("");
      setNotice("Operator account suspended and all active sessions revoked.");
      queryClient.setQueryData(["platform-user", userId], data);
      queryClient.invalidateQueries({ queryKey: ["platform-users"] });
      queryClient.invalidateQueries({ queryKey: ["platform-user-activity", userId] });
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : "Failed to suspend operator.");
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: () =>
      api<PlatformUserDetail>(`/api/v1/platform/users/${userId}/reactivate/`, {
        method: "POST",
        body: JSON.stringify({ reason: reactivateReason.trim() }),
      }),
    onSuccess: (data) => {
      setReactivateModalOpen(false);
      setReactivateReason("");
      setNotice("Operator account reactivated.");
      queryClient.setQueryData(["platform-user", userId], data);
      queryClient.invalidateQueries({ queryKey: ["platform-users"] });
      queryClient.invalidateQueries({ queryKey: ["platform-user-activity", userId] });
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : "Failed to reactivate operator.");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: () =>
      api<PlatformUserDetail>(`/api/v1/platform/users/${userId}/deactivate/`, {
        method: "POST",
        body: JSON.stringify({ reason: deactivateReason.trim() }),
      }),
    onSuccess: (data) => {
      setDeactivateModalOpen(false);
      setDeactivateReason("");
      setNotice("Operator account deactivated.");
      queryClient.setQueryData(["platform-user", userId], data);
      queryClient.invalidateQueries({ queryKey: ["platform-users"] });
      queryClient.invalidateQueries({ queryKey: ["platform-user-activity", userId] });
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : "Failed to deactivate operator.");
    },
  });

  const revokeSessions = useMutation({
    mutationFn: () =>
      api<{ revoked: boolean }>(`/api/v1/platform/users/${userId}/revoke-sessions/`, {
        method: "POST",
      }),
    onSuccess: () => {
      setNotice("All active sessions for this operator have been invalidated.");
      queryClient.invalidateQueries({ queryKey: ["platform-user-activity", userId] });
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : "Failed to revoke sessions.");
    },
  });

  const sendReset = useMutation({
    mutationFn: () =>
      api<void>(`/api/v1/platform/users/${userId}/send-password-reset/`, { method: "POST" }),
    onSuccess: () => {
      setFormError("");
      setNotice("Password reset email sent to operator.");
    },
    onError: (error) => {
      setNotice("");
      setFormError(error instanceof ApiError ? error.message : "Could not send the reset email.");
    },
  });

  const transferMutation = useMutation({
    mutationFn: () =>
      api<{ transferred: boolean; new_super_admin: string }>("/api/v1/platform/super-admin/transfer-ownership/", {
        method: "POST",
        body: JSON.stringify({
          password: transferPassword,
          confirm_transfer: transferConfirm,
          target_user_id: transferTargetId,
          former_admin_role_id: transferFallbackRoleId || undefined,
          reason: transferReason.trim() || undefined,
        }),
      }),
    onSuccess: (data) => {
      setTransferModalOpen(false);
      setTransferError("");
      setNotice(`Super Admin ownership successfully transferred to ${data.new_super_admin}.`);
      queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["platform-users"] });
      navigate("/platform/users");
    },
    onError: (err) => {
      setTransferError(err instanceof ApiError ? err.message : "Failed to transfer ownership.");
    },
  });

  if (detail.isLoading || catalog.isLoading || rolesQuery.isLoading) {
    return <LoadingState label="Loading operator details" />;
  }

  if (detail.error || !detail.data) {
    return (
      <ErrorState
        title="Operator not found"
        body={detail.error instanceof ApiError ? detail.error.message : "The requested operator could not be loaded."}
        action={
          <Link
            className="inline-flex rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-200"
            to="/platform/users"
          >
            Back to operators
          </Link>
        }
      />
    );
  }

  const user = detail.data;
  const isTargetSuperAdmin = Boolean(user.is_super_admin);
  const operatorStatus = user.status || (user.is_active ? "active" : "deactivated");
  const isSuspended = operatorStatus === "suspended";
  const isDeactivated = operatorStatus === "deactivated" || !user.is_active;

  const currentRole = rolesQuery.data?.results.find((r) => r.id === selectedRoleId);
  const effectivePermissions = user.effective_permissions || user.permission_codes || [];

  const dirty =
    firstName !== (user.first_name || "") ||
    lastName !== (user.last_name || "") ||
    selectedRoleId !== (user.role?.id || "") ||
    customPermissions.slice().sort().join() !== (user.custom_permissions || []).slice().sort().join();

  function submitSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!dirty || isTargetSuperAdmin) return;
    setFormError("");
    setNotice("");
    save.mutate();
  }

  return (
    <section className="space-y-6">
      <Breadcrumbs items={["Platform", "Operators", user.email]} />

      {/* Header Banner */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{user.email}</h1>
            {isTargetSuperAdmin ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-0.5 text-xs font-semibold text-violet-900 border border-violet-300 dark:bg-violet-950 dark:border-violet-700 dark:text-violet-200 shadow-xs">
                <span className="h-2 w-2 rounded-full bg-violet-600 animate-pulse"></span>
                Super Admin (Protected)
              </span>
            ) : isSuspended ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 border border-amber-300 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-200">
                Suspended
              </span>
            ) : isDeactivated ? (
              <StatusBadge status="inactive" />
            ) : (
              <StatusBadge status="active" />
            )}
            {isSelf ? (
              <span className="rounded-md bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-900 dark:bg-teal-950 dark:text-teal-200 border border-teal-200 dark:border-teal-800">
                You
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {user.email_verified ? "Email verified" : "Email not verified"}
            <span className="text-slate-300 dark:text-slate-600"> · </span>
            Created {new Date(user.created_at).toLocaleString()}
            {user.last_login ? (
              <>
                <span className="text-slate-300 dark:text-slate-600"> · </span>
                Last login: {new Date(user.last_login).toLocaleString()}
              </>
            ) : null}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            className="text-sm font-medium text-teal-800 hover:underline dark:text-teal-300"
            to="/platform/users"
          >
            ← Back to Operators
          </Link>
        </div>
      </div>

      {notice ? (
        <div className="rounded-md bg-teal-50 border border-teal-200 p-3 text-sm text-teal-800 dark:bg-teal-950/70 dark:border-teal-800 dark:text-teal-200 flex items-center justify-between">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} className="text-xs underline ml-2">Dismiss</button>
        </div>
      ) : null}
      {formError ? (
        <div className="rounded-md bg-rose-50 border border-rose-200 p-3 text-sm text-rose-800 dark:bg-rose-950/70 dark:border-rose-800 dark:text-rose-200">
          {formError}
        </div>
      ) : null}

      {/* Super Admin Protected Account Notice */}
      {isTargetSuperAdmin ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-900 dark:bg-violet-950/40">
          <div className="flex items-start gap-3">
            <div className="text-violet-700 dark:text-violet-300 text-lg font-bold">🛡️</div>
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-violet-900 dark:text-violet-200">
                Super Admin Account Protection
              </h2>
              <p className="text-xs text-violet-800 dark:text-violet-300 leading-relaxed">
                There is exactly one Super Admin in the entire platform. This account cannot be suspended, deactivated, or deleted, and its privileges cannot be removed through normal role management.
                {isSelf ? " To transfer Super Admin privileges to another operator, use the Ownership Transfer procedure below." : ""}
              </p>
              {isSelf ? (
                <div className="pt-2">
                  <Button type="button" variant="secondary" onClick={() => setTransferModalOpen(true)}>
                    Transfer Super Admin Ownership
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Main Profile & Role Form */}
      <form className="space-y-6" onSubmit={submitSave}>
        {/* Profile Details */}
        <section className="grid gap-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 md:grid-cols-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 md:col-span-2">
            Operator Profile
          </h2>
          <TextField
            label="First name"
            name="first_name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={!canManage || isTargetSuperAdmin}
          />
          <TextField
            label="Last name"
            name="last_name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={!canManage || isTargetSuperAdmin}
          />
        </section>

        {/* Assigned Platform Role */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Assigned Platform Role
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Platform operators receive permissions dynamically through their assigned role.
              </p>
            </div>
            {user.role ? (
              <span className="text-xs text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-full font-medium dark:bg-teal-950 dark:border-teal-800 dark:text-teal-300">
                Current: {user.role.name}
              </span>
            ) : null}
          </div>

          {isTargetSuperAdmin ? (
            <p className="text-sm text-slate-600 dark:text-slate-300 italic bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              The Super Admin holds all platform permissions intrinsically and does not receive ordinary platform roles.
            </p>
          ) : (
            <>
              <SelectField
                label="Select Role"
                name="role_id"
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                disabled={!isSuperAdmin}
              >
                <option value="">-- No role assigned --</option>
                {rolesQuery.data?.results.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.permission_codes?.length ?? 0} grants)
                  </option>
                ))}
              </SelectField>

              {currentRole ? (
                <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-3 dark:border-teal-900 dark:bg-teal-950/20">
                  <p className="text-xs font-semibold uppercase tracking-wider text-teal-800 dark:text-teal-300">
                    Role Description & Inherited Grants
                  </p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">
                    {currentRole.description || "No description provided."}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {currentRole.permission_codes?.map((code) => (
                      <span
                        key={code}
                        className="rounded bg-teal-100/70 px-2 py-0.5 text-xs font-medium text-teal-800 dark:bg-teal-900 dark:text-teal-200"
                      >
                        {code.replace(/^platform\./, "")}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}

          {isSuperAdmin && !isTargetSuperAdmin ? (
            <div className="pt-2">
              <Button type="submit" disabled={save.isPending || !dirty}>
                {save.isPending ? "Saving changes…" : "Save role assignment"}
              </Button>
            </div>
          ) : null}
        </section>

        {/* Effective Permissions Breakdown */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Effective Platform Permissions
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Total permissions authorized for this operator session.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {effectivePermissions.length} granted
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 pt-1">
            {effectivePermissions.map((code) => (
              <div
                key={code}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-teal-500"></span>
                <span>{code}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Account Lifecycle & Operator Actions */}
        {!isTargetSuperAdmin && canManage ? (
          <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Account Lifecycle & Session Management
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Suspend, reactivate, deactivate account, or invalidate active sessions immediately.
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5 pt-1">
              {/* Suspend / Reactivate */}
              {isSuspended ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setReactivateModalOpen(true)}
                >
                  Reactivate operator
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isSelf}
                  onClick={() => setSuspendModalOpen(true)}
                >
                  Suspend operator
                </Button>
              )}

              {/* Deactivate */}
              {!isDeactivated ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isSelf}
                  onClick={() => setDeactivateModalOpen(true)}
                >
                  Deactivate operator
                </Button>
              ) : !isSuspended ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setReactivateModalOpen(true)}
                >
                  Reactivate operator
                </Button>
              ) : null}

              {/* Revoke Active Sessions */}
              <ConfirmDialog
                title="Revoke all active sessions?"
                body="This will immediately invalidate all active sessions for this operator across all browsers. They must authenticate again."
                confirmLabel="Revoke all sessions"
                trigger={
                  <Button type="button" variant="secondary" disabled={revokeSessions.isPending}>
                    Revoke active sessions
                  </Button>
                }
                onConfirm={() => revokeSessions.mutate()}
              />

              {/* Password Reset */}
              <Button
                type="button"
                variant="secondary"
                disabled={sendReset.isPending || isDeactivated}
                onClick={() => sendReset.mutate()}
              >
                {sendReset.isPending ? "Sending…" : "Send password reset email"}
              </Button>
            </div>
          </section>
        ) : null}

        {/* Operator Activity History */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Operator Activity History
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Immutable platform audit records where this operator is the actor or target.
              </p>
            </div>
          </div>

          {activityQuery.isLoading ? (
            <p className="text-xs text-slate-500">Loading audit history…</p>
          ) : activityQuery.data?.results && activityQuery.data.results.length > 0 ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {activityQuery.data.results.map((log) => (
                <div key={log.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-teal-800 dark:text-teal-300 font-mono">
                      {log.action}
                    </span>
                    <span className="text-slate-400 ml-2">by {log.actor_name || log.actor_email}</span>
                  </div>
                  <span className="text-slate-500">{new Date(log.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-2">No audit records found for this operator.</p>
          )}
        </section>
      </form>

      {/* Suspend Operator Modal */}
      <Modal
        open={suspendModalOpen}
        onClose={() => setSuspendModalOpen(false)}
        title={`Suspend operator: ${user.email}`}
        description="The operator will be immediately barred from signing in and all active sessions will be invalidated. Reason is required for audit records."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setSuspendModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={suspendMutation.isPending || !suspendReason.trim()}
              onClick={() => suspendMutation.mutate()}
            >
              {suspendMutation.isPending ? "Suspending…" : "Confirm suspension"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <TextField
            label="Reason for suspension"
            name="suspendReason"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            placeholder="e.g. Temporary leave, security investigation, compliance review"
            required
          />
        </div>
      </Modal>

      {/* Reactivate Operator Modal */}
      <Modal
        open={reactivateModalOpen}
        onClose={() => setReactivateModalOpen(false)}
        title={`Reactivate operator: ${user.email}`}
        description="The operator will be restored to active status and will be able to authenticate again."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setReactivateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={reactivateMutation.isPending}
              onClick={() => reactivateMutation.mutate()}
            >
              {reactivateMutation.isPending ? "Reactivating…" : "Confirm reactivation"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <TextField
            label="Reason for reactivation (optional)"
            name="reactivateReason"
            value={reactivateReason}
            onChange={(e) => setReactivateReason(e.target.value)}
            placeholder="e.g. Investigation completed, returned from leave"
          />
        </div>
      </Modal>

      {/* Deactivate Operator Modal */}
      <Modal
        open={deactivateModalOpen}
        onClose={() => setDeactivateModalOpen(false)}
        title={`Deactivate operator: ${user.email}`}
        description="The operator account will be set to inactive and sessions revoked. Records are preserved in the platform audit log."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setDeactivateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={deactivateMutation.isPending || !deactivateReason.trim()}
              onClick={() => deactivateMutation.mutate()}
            >
              {deactivateMutation.isPending ? "Deactivating…" : "Confirm deactivation"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <TextField
            label="Reason for deactivation"
            name="deactivateReason"
            value={deactivateReason}
            onChange={(e) => setDeactivateReason(e.target.value)}
            placeholder="e.g. Departed organization, role terminated"
            required
          />
        </div>
      </Modal>

      {/* Ownership Transfer Modal */}
      <Modal
        open={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        title="Transfer Super Admin Ownership"
        description="Permanently transfer single Super Admin status to another active platform operator. Strong identity verification is required."
        wide
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setTransferModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={transferMutation.isPending || !transferPassword || !transferTargetId || !transferConfirm}
              onClick={() => transferMutation.mutate()}
            >
              {transferMutation.isPending ? "Transferring ownership…" : "Execute ownership transfer"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            <strong>Warning:</strong> You will immediately lose Super Admin status upon confirmation. The target operator will become the sole Super Admin of the Pulse platform.
          </div>

          <TextField
            label="Confirm your current Super Admin password"
            name="transferPassword"
            type="password"
            value={transferPassword}
            onChange={(e) => setTransferPassword(e.target.value)}
            required
          />

          <SelectField
            label="Select target platform operator"
            name="transferTargetId"
            value={transferTargetId}
            onChange={(e) => setTransferTargetId(e.target.value)}
            required
          >
            <option value="">-- Choose active operator --</option>
            {operatorsQuery.data?.results
              .filter((op) => op.id !== userId)
              .map((op) => (
                <option key={op.id} value={op.id}>
                  {op.email} ({[op.first_name, op.last_name].filter(Boolean).join(" ") || "No name"})
                </option>
              ))}
          </SelectField>

          <SelectField
            label="Role to assign to your outgoing account"
            name="transferFallbackRoleId"
            value={transferFallbackRoleId}
            onChange={(e) => setTransferFallbackRoleId(e.target.value)}
          >
            <option value="">-- Choose fallback role --</option>
            {rolesQuery.data?.results.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </SelectField>

          <TextField
            label="Transfer reason / audit notes"
            name="transferReason"
            value={transferReason}
            onChange={(e) => setTransferReason(e.target.value)}
            placeholder="e.g. Executive handover, planned transition"
          />

          <label className="flex items-start gap-2 text-xs font-semibold text-rose-900 dark:text-rose-200 cursor-pointer pt-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={transferConfirm}
              onChange={(e) => setTransferConfirm(e.target.checked)}
            />
            <span>
              I understand this action transfers complete platform ownership and cannot be reversed by me.
            </span>
          </label>

          {transferError ? <p className="text-sm text-rose-700 dark:text-rose-400">{transferError}</p> : null}
        </div>
      </Modal>
    </section>
  );
}
