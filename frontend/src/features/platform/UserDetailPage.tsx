import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import type { CurrentUser, PlatformPermission, PlatformUserDetail } from "../../shared/api/types";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { TextField } from "../../shared/ui/Fields";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { ErrorState, LoadingState } from "../../shared/ui/States";
import { PlatformGrantCheckboxes } from "./PlatformGrantCheckboxes";

export function UserDetailPage() {
  const { userId = "" } = useParams();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<CurrentUser>("/api/v1/auth/me/") });
  const canManage = Boolean(me.data?.platform_permissions.includes("platform.users.manage"));
  const isSelf = me.data?.id === userId;

  const detail = useQuery({
    queryKey: ["platform-user", userId],
    queryFn: () => api<PlatformUserDetail>(`/api/v1/platform/users/${userId}/`),
    enabled: Boolean(userId),
  });
  const catalog = useQuery({
    queryKey: ["platform-permissions"],
    queryFn: () => api<{ results: PlatformPermission[] }>("/api/v1/platform/permissions/"),
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!detail.data) return;
    setFirstName(detail.data.first_name);
    setLastName(detail.data.last_name);
    setIsActive(detail.data.is_active);
    setSelected(detail.data.permission_codes);
  }, [detail.data]);

  const save = useMutation({
    mutationFn: () =>
      api<PlatformUserDetail>(`/api/v1/platform/users/${userId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          is_active: isActive,
          permission_codes: selected,
        }),
      }),
    onSuccess: (data) => {
      setFormError("");
      setNotice("Saved.");
      queryClient.setQueryData(["platform-user", userId], data);
      queryClient.invalidateQueries({ queryKey: ["platform-users"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error) => {
      setNotice("");
      setFormError(error instanceof ApiError ? error.message : "Could not save changes.");
    },
  });

  const sendReset = useMutation({
    mutationFn: () =>
      api<void>(`/api/v1/platform/users/${userId}/send-password-reset/`, { method: "POST" }),
    onSuccess: () => {
      setFormError("");
      setNotice("Password reset email sent.");
    },
    onError: (error) => {
      setNotice("");
      setFormError(error instanceof ApiError ? error.message : "Could not send the reset email.");
    },
  });

  if (detail.isLoading || catalog.isLoading) {
    return <LoadingState label="Loading user" />;
  }

  if (detail.error || !detail.data) {
    return (
      <ErrorState
        title="User could not be loaded"
        body={detail.error instanceof ApiError ? detail.error.message : "That user was not found."}
        action={
          <Link
            className="inline-flex rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-200"
            to="/platform/users"
          >
            Back to users
          </Link>
        }
      />
    );
  }

  const user = detail.data;
  const permissions = catalog.data?.results ?? [];
  const dirty =
    firstName !== user.first_name ||
    lastName !== user.last_name ||
    isActive !== user.is_active ||
    selected.slice().sort().join() !== user.permission_codes.slice().sort().join();
  const clearingAllGrants = user.permission_codes.length > 0 && selected.length === 0;

  function submitSave() {
    setFormError("");
    setNotice("");
    save.mutate();
  }

  return (
    <section className="space-y-5">
      <Breadcrumbs items={["Platform", "Users", user.email]} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{user.email}</h1>
            <StatusBadge status={user.is_active ? "active" : "inactive"} />
            {isSelf ? (
              <span className="rounded-md bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-900 dark:bg-teal-950 dark:text-teal-200">
                You
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {user.email_verified ? "Email verified" : "Email not verified"}
            <span className="text-slate-300 dark:text-slate-600"> · </span>
            Created {new Date(user.created_at).toLocaleString()}
          </p>
        </div>
        <Link className="text-sm font-medium text-teal-800 dark:text-teal-300" to="/platform/users">
          ← All users
        </Link>
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canManage || !dirty) return;
          submitSave();
        }}
      >
        <section className="grid gap-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 md:grid-cols-2">
          <TextField
            label="First name"
            name="first_name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            disabled={!canManage}
          />
          <TextField
            label="Last name"
            name="last_name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            disabled={!canManage}
          />
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 md:col-span-2">
            <input
              type="checkbox"
              checked={isActive}
              disabled={!canManage || isSelf}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            Account active
            {isSelf ? <span className="text-xs text-slate-500">(you cannot deactivate yourself)</span> : null}
          </label>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Platform grants
          </div>
          <div className="p-4">
            <PlatformGrantCheckboxes
              catalog={permissions}
              selected={selected}
              onChange={setSelected}
              disabled={!canManage}
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Company memberships</h2>
          {user.memberships.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No company memberships.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {user.memberships.map((row) => (
                <li key={row.company_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-medium text-slate-900 dark:text-slate-100">{row.company_display_name}</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {row.company_slug} · {row.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {formError ? <p className="text-sm text-rose-700 dark:text-rose-400">{formError}</p> : null}
        {notice ? <p className="text-sm text-pulse-success">{notice}</p> : null}

        {canManage ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={sendReset.isPending || !user.is_active}
                onClick={() => sendReset.mutate()}
              >
                {sendReset.isPending ? "Sending…" : "Send password reset email"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {clearingAllGrants && dirty ? (
                <ConfirmDialog
                  title="Clear all platform grants?"
                  body="This operator will lose every platform permission. You can restore grants later."
                  confirmLabel="Clear grants and save"
                  trigger={
                    <Button type="button" disabled={save.isPending}>
                      Save changes
                    </Button>
                  }
                  onConfirm={submitSave}
                />
              ) : user.is_active && !isActive && dirty ? (
                <ConfirmDialog
                  title="Deactivate this account?"
                  body="They will not be able to sign in until reactivated."
                  confirmLabel="Deactivate and save"
                  trigger={
                    <Button type="button" disabled={save.isPending}>
                      Save changes
                    </Button>
                  }
                  onConfirm={submitSave}
                />
              ) : (
                <Button type="submit" disabled={save.isPending || !dirty}>
                  {save.isPending ? "Saving…" : "Save changes"}
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </form>
    </section>
  );
}
