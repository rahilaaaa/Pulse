import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import type { UserList } from "../../shared/api/types";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { SelectField, TextField } from "../../shared/ui/Fields";
import { Pagination } from "../../shared/ui/Pagination";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";

const PAGE_SIZE = 25;

export function UsersPage() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [accountStatus, setAccountStatus] = useState(params.get("account_status") ?? "");
  const [mfa, setMfa] = useState(params.get("mfa") ?? "");
  const [page, setPage] = useState(1);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), sort: "-created_at" });
    if (submittedSearch) params.set("q", submittedSearch);
    if (accountStatus) params.set("account_status", accountStatus);
    if (mfa) params.set("mfa", mfa);
    return params.toString();
  }, [accountStatus, mfa, page, submittedSearch]);

  const users = useQuery({
    queryKey: ["platform-users", queryString],
    queryFn: () => api<UserList>(`/api/v1/platform/users/?${queryString}`),
  });

  return (
    <section className="space-y-5">
      <Breadcrumbs items={["Platform", "Users"]} />
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
        <p className="mt-1 text-sm text-slate-600">Accounts stored in PostgreSQL. Passwords and authenticator secrets are not included.</p>
      </div>
      <form
        className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-[1fr_12rem_12rem_auto]"
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
          label="Authenticator"
          name="mfa"
          value={mfa}
          onChange={(event) => {
            setMfa(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Not set up</option>
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
        <EmptyState title="No users" body="No accounts match this search." />
      ) : null}
      {users.data && users.data.results.length > 0 ? (
        <>
          <DataTable columns={["Email", "Name", "Account", "Authenticator", "Memberships", "Grants", "Created"]}>
            {users.data.results.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{user.email}</td>
                <td className="px-4 py-3 text-slate-600">{[user.first_name, user.last_name].filter(Boolean).join(" ") || "—"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={user.is_active ? "active" : "inactive"} />
                </td>
                <td className="px-4 py-3 text-slate-600">{user.mfa_enabled ? "Enabled" : "Not set up"}</td>
                <td className="px-4 py-3 text-slate-600">{user.membership_count}</td>
                <td className="px-4 py-3 text-slate-600">{user.platform_grant_count}</td>
                <td className="px-4 py-3 text-slate-600">{new Date(user.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </DataTable>
          <Pagination page={users.data.page} pageCount={users.data.page_count} onPageChange={setPage} />
        </>
      ) : null}
    </section>
  );
}
