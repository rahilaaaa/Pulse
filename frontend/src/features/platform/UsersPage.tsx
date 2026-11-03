import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import type { CurrentUser, PlatformPermission, PlatformUserDetail, UserList } from "../../shared/api/types";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
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
  const [accountStatus, setAccountStatus] = useState(params.get("account_status") ?? "");
  const [emailVerified, setEmailVerified] = useState(params.get("email_verified") ?? "");
  const [hasPlatformGrants, setHasPlatformGrants] = useState(params.get("has_platform_grants") ?? "yes");
  const [page, setPage] = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteGrants, setInviteGrants] = useState<string[]>([]);
  const [inviteError, setInviteError] = useState("");
  const [inviteNotice, setInviteNotice] = useState("");

  const me = useQuery({ queryKey: ["me"], queryFn: () => api<CurrentUser>("/api/v1/auth/me/") });
  const canManage = Boolean(me.data?.platform_permissions.includes("platform.users.manage"));
  const selfId = me.data?.id;

  const queryString = useMemo(() => {
    const next = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), sort: "-created_at" });
    if (submittedSearch) next.set("q", submittedSearch);
    if (accountStatus) next.set("account_status", accountStatus);
    if (emailVerified) next.set("email_verified", emailVerified);
    if (hasPlatformGrants) next.set("has_platform_grants", hasPlatformGrants);
    return next.toString();
  }, [accountStatus, emailVerified, hasPlatformGrants, page, submittedSearch]);

  const users = useQuery({
    queryKey: ["platform-users", queryString],
    queryFn: () => api<UserList>(`/api/v1/platform/users/?${queryString}`),
  });

  const catalog = useQuery({
    queryKey: ["platform-permissions"],
    queryFn: () => api<{ results: PlatformPermission[] }>("/api/v1/platform/permissions/"),
    enabled: canManage,
  });

  const invite = useMutation({
    mutationFn: () =>
      api<PlatformUserDetail>("/api/v1/platform/users/", {
        method: "POST",
        body: JSON.stringify({
          email: inviteEmail.trim(),
          first_name: inviteFirstName.trim(),
          last_name: inviteLastName.trim(),
          permission_codes: inviteGrants,
          send_invite: true,
        }),
      }),
    onSuccess: (data) => {
      setInviteError("");
      setInviteNotice(data.invite_sent ? "Invite email sent." : "Operator saved.");
      setInviteOpen(false);
      setInviteEmail("");
      setInviteFirstName("");
      setInviteLastName("");
      setInviteGrants([]);
      queryClient.invalidateQueries({ queryKey: ["platform-users"] });
      navigate(`/platform/users/${data.id}`);
    },
    onError: (error) => {
      setInviteError(error instanceof ApiError ? error.message : "The invitation could not be sent.");
    },
  });

  function openInvite() {
    setInviteError("");
    setInviteNotice("");
    setInviteEmail("");
    setInviteFirstName("");
    setInviteLastName("");
    const codes = catalog.data?.results.map((item) => item.code) ?? [];
    setInviteGrants(codes.length ? codes : ["platform.users.view", "platform.users.manage"]);
    setInviteOpen(true);
  }

  const operatorsFilter = hasPlatformGrants === "yes";

  return (
    <section className="space-y-5">
      <Breadcrumbs items={["Platform", operatorsFilter ? "Operators" : "Users"]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {operatorsFilter ? "Platform operators" : "Users"}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {operatorsFilter
              ? "Accounts with platform permission grants. Passwords are not included."
              : "Accounts stored in PostgreSQL. Passwords are not included."}
          </p>
          {inviteNotice ? <p className="mt-2 text-sm text-pulse-success">{inviteNotice}</p> : null}
        </div>
        {canManage ? (
          <Button type="button" onClick={openInvite}>
            Invite operator
          </Button>
        ) : null}
      </div>
      <form
        className="grid gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 md:grid-cols-[1fr_12rem_12rem_12rem_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSubmittedSearch(search.trim());
        }}
      >
        <TextField label="Search" name="q" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Email or name" />
        <SelectField
          label="Account"
          name="account_status"
          value={accountStatus}
          onChange={(event) => {
            setAccountStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All accounts</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </SelectField>
        <SelectField
          label="Email"
          name="email_verified"
          value={emailVerified}
          onChange={(event) => {
            setEmailVerified(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All</option>
          <option value="yes">Verified</option>
          <option value="no">Unverified</option>
        </SelectField>
        <SelectField
          label="Platform grants"
          name="has_platform_grants"
          value={hasPlatformGrants}
          onChange={(event) => {
            setHasPlatformGrants(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All</option>
          <option value="yes">Operators</option>
          <option value="no">No grants</option>
        </SelectField>
        <div className="flex items-end">
          <Button type="submit">Search</Button>
        </div>
      </form>
      {users.isLoading ? <LoadingState label="Loading users" /> : null}
      {users.error ? (
        <ErrorState
          title="Users could not be loaded"
          body={users.error instanceof ApiError ? users.error.message : "The platform API returned an error."}
          action={
            <Button type="button" variant="secondary" onClick={() => users.refetch()}>
              Try again
            </Button>
          }
        />
      ) : null}
      {users.data && users.data.count === 0 ? (
        <EmptyState
          title={operatorsFilter ? "No operators" : "No users"}
          body={
            operatorsFilter
              ? "No accounts with platform grants match this search."
              : "No accounts match this search."
          }
          action={
            canManage && operatorsFilter ? (
              <Button type="button" onClick={openInvite}>
                Invite operator
              </Button>
            ) : undefined
          }
        />
      ) : null}
      {users.data && users.data.results.length > 0 ? (
        <>
          <DataTable columns={["Email", "Name", "Account", "Verified", "Grants", "Last Login", "Created", ""]}>
            {users.data.results.map((user) => (
              <tr key={user.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => navigate(`/platform/users/${user.id}`)}>
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                  <Link className="text-teal-800 hover:underline dark:text-teal-300" to={`/platform/users/${user.id}`} onClick={(event) => event.stopPropagation()}>
                    {user.email}
                  </Link>
                  {user.id === selfId ? (
                    <span className="ml-2 rounded-md bg-teal-50 px-1.5 py-0.5 text-xs font-medium text-teal-900 dark:bg-teal-950 dark:text-teal-200">
                      You
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{[user.first_name, user.last_name].filter(Boolean).join(" ") || "—"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={user.is_active ? "active" : "inactive"} />
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{user.email_verified ? "Yes" : "No"}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                    {user.platform_grant_count} grants
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                  {user.last_login ? new Date(user.last_login).toLocaleString() : "Never"}
                </td>

                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{new Date(user.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    className="text-sm font-medium text-teal-800 hover:underline dark:text-teal-300"
                    to={`/platform/users/${user.id}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </DataTable>
          <Pagination page={users.data.page} pageCount={users.data.page_count} onPageChange={setPage} />
        </>
      ) : null}

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite operator"
        description="Creates or reuses the account, assigns platform grants, and emails a set-password link."
        wide
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={invite.isPending || !inviteEmail.trim() || inviteGrants.length === 0}
              onClick={() => {
                setInviteError("");
                invite.mutate();
              }}
            >
              {invite.isPending ? "Sending…" : "Send invite"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Email"
            name="email"
            type="email"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            required
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="First name"
              name="first_name"
              value={inviteFirstName}
              onChange={(event) => setInviteFirstName(event.target.value)}
            />
            <TextField
              label="Last name"
              name="last_name"
              value={inviteLastName}
              onChange={(event) => setInviteLastName(event.target.value)}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Platform grants</p>
            {catalog.isLoading ? (
              <p className="text-sm text-slate-500">Loading permissions…</p>
            ) : (
              <PlatformGrantCheckboxes
                catalog={catalog.data?.results ?? []}
                selected={inviteGrants}
                onChange={setInviteGrants}
              />
            )}
          </div>
          {inviteError ? <p className="text-sm text-rose-700 dark:text-rose-400">{inviteError}</p> : null}
        </div>
      </Modal>
    </section>
  );
}
