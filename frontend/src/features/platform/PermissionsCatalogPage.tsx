import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../shared/api/client";
import type { PlatformPermission } from "../../shared/api/types";
import { Button } from "../../shared/ui/Button";

const CATEGORY_MAP: Record<string, { label: string; impact: "Critical" | "High" | "Standard" }> = {
  "platform.users.manage": { label: "Access Control", impact: "Critical" },
  "platform.users.view": { label: "Access Control", impact: "Standard" },
  "platform.companies.manage": { label: "Tenancy & Lifecycle", impact: "Critical" },
  "platform.companies.view": { label: "Tenancy & Lifecycle", impact: "Standard" },
  "platform.billing.manage": { label: "Commercial & Finance", impact: "Critical" },
  "platform.billing.view": { label: "Commercial & Finance", impact: "Standard" },
  "platform.modules.manage": { label: "Catalog & Extensibility", impact: "High" },
  "platform.operations.view": { label: "System Operations", impact: "Standard" },
  "platform.audit.view": { label: "Audit & Compliance", impact: "High" },
};

export function PermissionsCatalogPage() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  const { data, isLoading, error } = useQuery<{ results: PlatformPermission[] }>({
    queryKey: ["platform-permissions-catalog"],
    queryFn: () => api<{ results: PlatformPermission[] }>("/api/v1/platform/permissions/"),
  });

  const permissions = data?.results ?? [];

  const filteredPermissions = permissions.filter((perm) => {
    const matchesSearch =
      perm.code.toLowerCase().includes(search.toLowerCase()) ||
      perm.description.toLowerCase().includes(search.toLowerCase());

    const cat = CATEGORY_MAP[perm.code]?.label ?? "General";
    const matchesCat = selectedCategory === "ALL" || cat === selectedCategory;

    return matchesSearch && matchesCat;
  });

  const totalGrants = permissions.reduce((acc, p) => acc + (p.active_grants_count ?? 0), 0);
  const criticalCount = permissions.filter(
    (p) => CATEGORY_MAP[p.code]?.impact === "Critical"
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <svg className="h-6 w-6 text-teal-600 dark:text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Platform Permissions Catalog
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Canonical permission scopes governing platform administrator privileges and operator grants.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/platform/users">
            <Button variant="secondary" className="flex items-center gap-1.5 text-xs">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Manage Operators
            </Button>
          </Link>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Total Permissions
            </span>
            <div className="p-2 bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 rounded-lg">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 2l-2 2m-1-1l-3 3m2 2l-3 3m2 2l-3 3M3 21l9-9" />
                <circle cx="7.5" cy="7.5" r="4.5" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            {permissions.length}
          </div>
          <p className="mt-1 text-xs text-neutral-500">Fine-grained platform capabilities</p>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Critical Scopes
            </span>
            <div className="p-2 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-lg">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400">
            {criticalCount}
          </div>
          <p className="mt-1 text-xs text-neutral-500">High-impact mutating operations</p>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Active Operator Grants
            </span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-lg">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <polyline points="17 11 19 13 23 9" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400">
            {totalGrants}
          </div>
          <p className="mt-1 text-xs text-neutral-500">Assigned across platform operators</p>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Scope Boundary
            </span>
            <div className="p-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 rounded-lg">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 pt-1">
            <span>Isolated Tenancy</span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">Zero crossover to tenant data</p>
        </div>
      </div>

      {/* Security Best-Practice Banner */}
      <div className="p-4 bg-teal-50/70 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/60 rounded-xl text-xs text-teal-900 dark:text-teal-200 flex items-start gap-3">
        <svg className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <div>
          <span className="font-semibold">Principle of Least Privilege Enforced: </span>
          Platform permissions apply strictly across platform control-plane endpoints. Company-level
          administrators and tenant employees cannot receive platform permissions. Additionally, Pulse
          safeguards the platform against accidental lockout by requiring at least one active operator with{" "}
          <code className="px-1 py-0.5 bg-teal-100 dark:bg-teal-900/60 rounded font-mono text-[11px]">
            platform.users.manage
          </code>{" "}
          at all times.
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center gap-3 justify-between">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Search code or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-3 pr-3 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {["ALL", "Access Control", "Tenancy & Lifecycle", "Commercial & Finance", "Catalog & Extensibility", "System Operations", "Audit & Compliance"].map(
            (cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? "bg-teal-600 text-white"
                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                }`}
              >
                {cat === "ALL" ? "All Scopes" : cat}
              </button>
            )
          )}
        </div>
      </div>

      {/* Permissions Table */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-neutral-500">Loading platform permissions...</div>
        ) : error ? (
          <div className="p-12 text-center text-sm text-rose-500">Failed to load permissions catalog.</div>
        ) : filteredPermissions.length === 0 ? (
          <div className="p-12 text-center text-sm text-neutral-500">No matching permissions found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/60 font-semibold text-neutral-600 dark:text-neutral-400">
                  <th className="py-3 px-4">Permission Code</th>
                  <th className="py-3 px-4">Domain / Category</th>
                  <th className="py-3 px-4">Impact Level</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-center">Active Operators</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-neutral-800 dark:text-neutral-200">
                {filteredPermissions.map((perm) => {
                  const meta = CATEGORY_MAP[perm.code] || { label: "General", impact: "Standard" };
                  return (
                    <tr
                      key={perm.code}
                      className="hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-medium text-teal-700 dark:text-teal-400">
                        {perm.code}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                            meta.impact === "Critical"
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
                              : meta.impact === "High"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                          }`}
                        >
                          {meta.impact}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-neutral-600 dark:text-neutral-300 max-w-md">
                        {perm.description}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-block px-2.5 py-0.5 rounded-full font-mono text-[11px] font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          {perm.active_grants_count ?? 0} operators
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          to="/platform/users"
                          className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:underline font-medium"
                        >
                          View Holders →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
