import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import type { CompanyList } from "../../shared/api/types";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { SelectField, TextField } from "../../shared/ui/Fields";
import { Pagination } from "../../shared/ui/Pagination";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";

const PAGE_SIZE = 25;

export function CompaniesPage() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [page, setPage] = useState(1);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), sort: "-created_at" });
    if (submittedSearch) params.set("q", submittedSearch);
    if (status) params.set("status", status);
    return params.toString();
  }, [page, status, submittedSearch]);

  const companies = useQuery({
    queryKey: ["platform-companies", queryString],
    queryFn: () => api<CompanyList>(`/api/v1/platform/companies/?${queryString}`),
  });

  return (
    <section className="space-y-5">
      <Breadcrumbs items={["Platform", "Companies"]} />
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Companies</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Open a company to see its members. Users are organized under companies, not as a global directory.
        </p>
      </div>
      <form
        className="grid gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 md:grid-cols-[1fr_12rem_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSubmittedSearch(search.trim());
        }}
      >
        <TextField label="Search" name="q" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or slug" />
        <SelectField
          label="Status"
          name="status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="closed">Closed</option>
        </SelectField>
        <div className="flex items-end">
          <Button type="submit">Search</Button>
        </div>
      </form>
      {companies.isLoading ? <LoadingState label="Loading companies" /> : null}
      {companies.error ? (
        <ErrorState
          title="Companies could not be loaded"
          body={companies.error instanceof ApiError ? companies.error.message : "The platform API returned an error."}
          action={
            <Button type="button" variant="secondary" onClick={() => companies.refetch()}>
              Try again
            </Button>
          }
        />
      ) : null}
      {companies.data && companies.data.count === 0 ? (
        <EmptyState title="No companies" body="No company records match this search. New companies will appear here after they are created." />
      ) : null}
      {companies.data && companies.data.results.length > 0 ? (
        <>
          <DataTable columns={["Name", "Slug", "Status", "Created", "Members"]}>
            {companies.data.results.map((company) => (
              <tr key={company.id}>
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                  <Link className="text-teal-800 hover:underline" to={`/platform/companies/${company.id}`}>
                    {company.display_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{company.slug}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={company.status} />
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{new Date(company.created_at).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <Link className="font-medium text-teal-800 hover:underline" to={`/platform/companies/${company.id}`}>
                    {company.membership_count}
                  </Link>
                </td>
              </tr>
            ))}
          </DataTable>
          <Pagination page={companies.data.page} pageCount={companies.data.page_count} onPageChange={setPage} />
        </>
      ) : null}
    </section>
  );
}
