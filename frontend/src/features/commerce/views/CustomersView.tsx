import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../shared/api/client";
import { Button } from "../../../shared/ui/Button";
import { Modal } from "../../../shared/ui/Modal";
import { EmptyState, LoadingState } from "../../../shared/ui/States";
import type { CommerceNavTab, CustomerItem } from "../types";

interface CustomersViewProps {
  companyId: string;
  currencySymbol: string;
  permissions: string[];
  onNavigateTab: (tab: CommerceNavTab, params?: Record<string, string>) => void;
  initialCreateOpen?: boolean;
}

export function CustomersView({
  companyId,
  currencySymbol,
  permissions,
  onNavigateTab,
  initialCreateOpen = false,
}: CustomersViewProps) {
  const queryClient = useQueryClient();
  const canManage = permissions.includes("commerce.manage.customers") || permissions.includes("parties.manage") || permissions.includes("commerce.manage");

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(initialCreateOpen);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const customersQuery = useQuery({
    queryKey: ["commerce-customers", companyId, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      return api<{ results: CustomerItem[] }>(`/api/v1/companies/${companyId}/commerce/customers/?${params.toString()}`);
    },
  });

  const customerDetailQuery = useQuery({
    queryKey: ["commerce-customer-detail", companyId, selectedCustomerId],
    queryFn: () => api<any>(`/api/v1/companies/${companyId}/commerce/customers/${selectedCustomerId}/`),
    enabled: Boolean(selectedCustomerId),
  });

  const createCustomerMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      api(`/api/v1/companies/${companyId}/commerce/customers/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce-customers", companyId] });
      setCreateOpen(false);
    },
  });

  const formatMoney = (minor: number) => `${currencySymbol}${(minor / 100).toFixed(2)}`;

  const customers = customersQuery.data?.results ?? [];
  const detail = customerDetailQuery.data;

  // Aggregate customer stats
  const totalSpendAll = customers.reduce((acc, c) => acc + (c.total_spent_minor || 0), 0);
  const totalOrdersAll = customers.reduce((acc, c) => acc + (c.orders_count || 0), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-pulse-ink">Commerce Customers</h2>
          <p className="text-xs text-pulse-muted">
            Customer directory powered by shared Parties (ADR-020). Tracks B2B accounts, consumers, and order lifetime value.
          </p>
        </div>

        {canManage && (
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Customer
          </Button>
        )}
      </div>

      {/* Customer KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-pulse-border bg-pulse-surface p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-pulse-muted">Total Customers</span>
          <div className="mt-1 text-xl font-bold text-pulse-ink">{customers.length}</div>
          <p className="mt-0.5 text-[10px] text-pulse-muted">Verified Parties accounts</p>
        </div>
        <div className="rounded-xl border border-pulse-border bg-pulse-surface p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-pulse-muted">Cumulative Spend</span>
          <div className="mt-1 text-xl font-bold text-teal-600 dark:text-teal-400">{formatMoney(totalSpendAll)}</div>
          <p className="mt-0.5 text-[10px] text-pulse-muted">Across all completed orders</p>
        </div>
        <div className="rounded-xl border border-pulse-border bg-pulse-surface p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-pulse-muted">Average Order Value</span>
          <div className="mt-1 text-xl font-bold text-pulse-ink">
            {formatMoney(totalOrdersAll ? Math.round(totalSpendAll / totalOrdersAll) : 0)}
          </div>
          <p className="mt-0.5 text-[10px] text-pulse-muted">LTV commercial metric</p>
        </div>
      </div>

      {/* Search Input */}
      <div className="flex items-center gap-3 rounded-xl border border-pulse-border bg-pulse-surface p-3 shadow-xs">
        <div className="flex-1">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers by name, email, or phone..."
            className="w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink placeholder-pulse-muted focus:border-pulse-accent focus:outline-hidden"
          />
        </div>
      </div>

      {/* Customers Table */}
      {customersQuery.isLoading ? (
        <LoadingState label="Loading customer directory..." />
      ) : customers.length === 0 ? (
        <EmptyState
          title="No customers found"
          body={search ? "No customer accounts match your search." : "Add customers or link them to sales orders."}
          action={canManage ? <Button onClick={() => setCreateOpen(true)}>Add Customer</Button> : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-pulse-border bg-pulse-surface shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-pulse-border bg-pulse-canvas/50 text-[11px] font-bold text-pulse-muted uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Customer Account</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3 text-center">Orders Placed</th>
                <th className="px-4 py-3 text-right">Lifetime Spend</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pulse-border">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-pulse-hover/50 transition">
                  <td className="px-4 py-3 font-bold text-pulse-ink">
                    {c.display_name}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        c.kind === "organization"
                          ? "bg-purple-50 text-purple-700 border border-purple-200"
                          : "bg-blue-50 text-blue-700 border border-blue-200"
                      }`}
                    >
                      {c.kind}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-pulse-muted text-[11px]">
                    {c.email && <div className="text-pulse-ink">{c.email}</div>}
                    {c.phone && <div>{c.phone}</div>}
                    {!c.email && !c.phone && "—"}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-pulse-ink">
                    {c.orders_count}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-pulse-ink">
                    {formatMoney(c.total_spent_minor)}
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <button
                      type="button"
                      onClick={() => setSelectedCustomerId(c.id)}
                      className="rounded-md border border-pulse-border px-2.5 py-1 text-[11px] font-semibold text-pulse-ink hover:bg-pulse-hover transition"
                    >
                      History
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigateTab("orders", { action: "create", party_id: c.id })}
                      className="rounded-md border border-pulse-border px-2.5 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 transition"
                    >
                      + Order
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Customer Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Customer Account">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            createCustomerMutation.mutate({
              display_name: String(form.get("display_name")),
              kind: String(form.get("kind") || "organization"),
              email: String(form.get("email") || ""),
              phone: String(form.get("phone") || ""),
            });
          }}
        >
          <div>
            <label className="block text-xs font-semibold text-pulse-ink">Customer / Organization Name *</label>
            <input
              name="display_name"
              required
              placeholder="e.g. FabIndia Retail Ltd or Vikram Rao"
              className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Party Classification</label>
              <select
                name="kind"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              >
                <option value="organization">Organization / B2B Company</option>
                <option value="person">Individual Consumer / Person</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Mobile Phone</label>
              <input
                name="phone"
                placeholder="e.g. 9876543210"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-pulse-ink">Email Address</label>
            <input
              name="email"
              type="email"
              placeholder="e.g. purchasing@client.example"
              className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createCustomerMutation.isPending}>
              Save Customer
            </Button>
          </div>
        </form>
      </Modal>

      {/* Customer Detail Modal */}
      {selectedCustomerId && (
        <Modal
          open={Boolean(selectedCustomerId)}
          onClose={() => setSelectedCustomerId(null)}
          title={`Customer: ${detail?.display_name || "Account Profile"}`}
        >
          {customerDetailQuery.isLoading || !detail ? (
            <LoadingState label="Loading purchase history..." />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg border border-pulse-border bg-pulse-canvas p-2.5">
                  <span className="text-[10px] uppercase font-bold text-pulse-muted">Total Orders</span>
                  <p className="font-bold text-pulse-ink text-sm">{detail.summary?.orders_count}</p>
                </div>
                <div className="rounded-lg border border-pulse-border bg-pulse-canvas p-2.5">
                  <span className="text-[10px] uppercase font-bold text-pulse-muted">Total Spend</span>
                  <p className="font-bold text-teal-600 text-sm">{formatMoney(detail.summary?.total_spent_minor)}</p>
                </div>
                <div className="rounded-lg border border-pulse-border bg-pulse-canvas p-2.5">
                  <span className="text-[10px] uppercase font-bold text-pulse-muted">Avg Order Value</span>
                  <p className="font-bold text-pulse-ink text-sm">{formatMoney(detail.summary?.average_order_value_minor)}</p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-pulse-ink mb-2">Purchase History</h4>
                {detail.orders?.length === 0 ? (
                  <p className="text-xs text-pulse-muted italic">No orders placed yet.</p>
                ) : (
                  <div className="divide-y divide-pulse-border rounded-lg border border-pulse-border max-h-56 overflow-y-auto">
                    {detail.orders?.map((o: any) => (
                      <div key={o.id} className="flex items-center justify-between p-2.5 text-xs">
                        <div>
                          <div className="font-bold text-pulse-ink">{o.order_number || "Draft"}</div>
                          <div className="text-[11px] text-pulse-muted">{new Date(o.created_at).toLocaleDateString()}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-pulse-ink">{formatMoney(o.total_minor)}</div>
                          <div className="text-[10px] uppercase font-semibold text-pulse-muted">{o.status}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-pulse-border">
                <Button
                  size="sm"
                  onClick={() => {
                    const cid = selectedCustomerId;
                    setSelectedCustomerId(null);
                    onNavigateTab("orders", { action: "create", party_id: cid });
                  }}
                >
                  + Create Order for Customer
                </Button>
                <Button variant="ghost" onClick={() => setSelectedCustomerId(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

