import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../shared/api/client";
import { Button } from "../../../shared/ui/Button";
import { Modal } from "../../../shared/ui/Modal";
import { EmptyState, LoadingState } from "../../../shared/ui/States";
import type { CustomerItem, PriceListItemRow, ProductItem } from "../types";

interface PriceListsViewProps {
  companyId: string;
  currencySymbol: string;
  permissions: string[];
}

export function PriceListsView({ companyId, currencySymbol, permissions }: PriceListsViewProps) {
  const queryClient = useQueryClient();
  const canManage = permissions.includes("commerce.manage.pricing") || permissions.includes("commerce.manage");

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedList, setSelectedList] = useState<PriceListItemRow | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);

  const priceListsQuery = useQuery({
    queryKey: ["commerce-price-lists", companyId],
    queryFn: () => api<{ results: PriceListItemRow[] }>(`/api/v1/companies/${companyId}/commerce/price-lists/`),
  });

  const customersQuery = useQuery({
    queryKey: ["commerce-customers", companyId],
    queryFn: () => api<{ results: CustomerItem[] }>(`/api/v1/companies/${companyId}/commerce/customers/`),
  });

  const productsQuery = useQuery({
    queryKey: ["commerce-products", companyId],
    queryFn: () => api<{ results: ProductItem[] }>(`/api/v1/companies/${companyId}/commerce/products/`),
    enabled: addItemOpen,
  });

  const detailQuery = useQuery({
    queryKey: ["commerce-price-list-detail", companyId, selectedList?.id],
    queryFn: () => api<any>(`/api/v1/companies/${companyId}/commerce/price-lists/${selectedList?.id}/`),
    enabled: Boolean(selectedList?.id),
  });

  const createListMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      api(`/api/v1/companies/${companyId}/commerce/price-lists/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce-price-lists", companyId] });
      setCreateOpen(false);
    },
  });

  const addItemMutation = useMutation({
    mutationFn: ({ listId, data }: { listId: string; data: Record<string, any> }) =>
      api(`/api/v1/companies/${companyId}/commerce/price-lists/${listId}/items/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce-price-list-detail", companyId, selectedList?.id] });
      queryClient.invalidateQueries({ queryKey: ["commerce-price-lists", companyId] });
      setAddItemOpen(false);
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: ({ listId, itemId }: { listId: string; itemId: string }) =>
      api(`/api/v1/companies/${companyId}/commerce/price-lists/${listId}/items/${itemId}/`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce-price-list-detail", companyId, selectedList?.id] });
      queryClient.invalidateQueries({ queryKey: ["commerce-price-lists", companyId] });
    },
  });

  const formatMoney = (minor: number) => `${currencySymbol}${(minor / 100).toFixed(2)}`;

  const lists = priceListsQuery.data?.results ?? [];
  const customers = customersQuery.data?.results ?? [];
  const products = productsQuery.data?.results ?? [];
  const detail = detailQuery.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-pulse-ink">Price Lists & Rules</h2>
          <p className="text-xs text-pulse-muted">
            Configure default prices, customer-specific contracts, and volume-based quantity tiers.
          </p>
        </div>

        {canManage && (
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Create Price List
          </Button>
        )}
      </div>

      {priceListsQuery.isLoading ? (
        <LoadingState label="Loading price lists..." />
      ) : lists.length === 0 ? (
        <EmptyState
          title="No custom price lists"
          body="Standard product prices are currently in effect. Create a price list to offer tiered or partner rates."
          action={canManage ? <Button onClick={() => setCreateOpen(true)}>Create Price List</Button> : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-pulse-border bg-pulse-surface shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-pulse-border bg-pulse-canvas/50 text-[11px] font-bold text-pulse-muted uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Price List</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Customer Scope</th>
                <th className="px-4 py-3 text-center">Items Configured</th>
                <th className="px-4 py-3 text-center">Default</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pulse-border">
              {lists.map((pl) => (
                <tr key={pl.id} className="hover:bg-pulse-hover/50 transition">
                  <td className="px-4 py-3">
                    <div className="font-bold text-pulse-ink">{pl.name}</div>
                    {pl.description && <div className="text-[11px] text-pulse-muted line-clamp-1">{pl.description}</div>}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] font-semibold text-pulse-ink">{pl.code}</td>
                  <td className="px-4 py-3 text-pulse-muted">
                    {pl.customer_name ? (
                      <span className="font-semibold text-pulse-ink">{pl.customer_name}</span>
                    ) : pl.party_kind === "organization" ? (
                      "B2B Corporate Only"
                    ) : pl.party_kind === "person" ? (
                      "Individual Consumers"
                    ) : (
                      "All Customers"
                    )}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-pulse-ink">
                    <span className="rounded-full bg-pulse-hover px-2.5 py-0.5 text-[11px]">
                      {pl.items_count} items
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {pl.is_default ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                        Default
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                      {pl.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedList(pl)}
                      className="rounded-md border border-pulse-border px-2.5 py-1 text-[11px] font-semibold text-pulse-ink hover:bg-pulse-hover transition"
                    >
                      Manage Rates
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Price List Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Price List">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            createListMutation.mutate({
              name: String(form.get("name")),
              code: String(form.get("code") || "").toUpperCase(),
              description: String(form.get("description") || ""),
              customer_party_id: form.get("customer_party_id") ? String(form.get("customer_party_id")) : null,
              party_kind: String(form.get("party_kind") || "all"),
              is_default: form.get("is_default") === "on",
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Price List Name *</label>
              <input
                name="name"
                required
                placeholder="e.g. VIP Wholesale Tier"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Code *</label>
              <input
                name="code"
                required
                placeholder="e.g. PL-WHOLESALE"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden uppercase"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Specific Customer (Optional)</label>
              <select
                name="customer_party_id"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              >
                <option value="">Any Customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name} ({c.kind})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Customer Scope</label>
              <select
                name="party_kind"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              >
                <option value="all">All Customer Accounts</option>
                <option value="organization">Corporate / Organization Only</option>
                <option value="person">Individual Consumers Only</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-pulse-ink">Description</label>
            <textarea
              name="description"
              rows={2}
              placeholder="Commercial contract details, discount rules..."
              className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_default"
              name="is_default"
              className="rounded border-pulse-border text-pulse-accent"
            />
            <label htmlFor="is_default" className="text-xs font-medium text-pulse-ink cursor-pointer">
              Set as company default selling price list
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createListMutation.isPending}>
              Create Price List
            </Button>
          </div>
        </form>
      </Modal>

      {/* Price List Items Detail Modal */}
      {selectedList && (
        <Modal
          open={Boolean(selectedList)}
          onClose={() => setSelectedList(null)}
          title={`Price List Rates: ${selectedList.name}`}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-pulse-muted">
                Custom item pricing and volume quantity breaks for this tier.
              </p>
              {canManage && (
                <Button size="sm" onClick={() => setAddItemOpen(true)}>
                  + Add Item Rate
                </Button>
              )}
            </div>

            {detailQuery.isLoading ? (
              <LoadingState label="Loading price list items..." />
            ) : detail?.items?.length === 0 ? (
              <div className="py-8 text-center text-xs text-pulse-muted">
                No items added yet. Click "+ Add Item Rate" to specify custom prices.
              </div>
            ) : (
              <div className="divide-y divide-pulse-border rounded-lg border border-pulse-border">
                {detail?.items?.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between p-3 text-xs">
                    <div>
                      <div className="font-bold text-pulse-ink">{item.product_name}</div>
                      <div className="text-[11px] text-pulse-muted font-mono">{item.product_sku}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="font-bold text-pulse-ink">{formatMoney(item.price_minor)}</div>
                        <div className="text-[10px] text-pulse-muted">Min Qty: {item.min_quantity}</div>
                      </div>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => removeItemMutation.mutate({ listId: selectedList.id, itemId: item.id })}
                          className="text-xs text-rose-600 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-pulse-border">
              <Button variant="ghost" onClick={() => setSelectedList(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Item to Price List Modal */}
      {selectedList && (
        <Modal open={addItemOpen} onClose={() => setAddItemOpen(false)} title={`Add Item to: ${selectedList.name}`}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              addItemMutation.mutate({
                listId: selectedList.id,
                data: {
                  product_id: String(form.get("product_id")),
                  min_quantity: Number(form.get("min_quantity") || 1),
                  price_minor: Math.round(Number(form.get("price") || 0) * 100),
                },
              });
            }}
          >
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Select Catalog Product *</label>
              <select
                name="product_id"
                required
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              >
                <option value="">Select a product...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku}) — Standard: {formatMoney(p.price_minor)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-pulse-ink">Custom Selling Price (₹) *</label>
                <input
                  name="price"
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-pulse-ink">Min. Order Quantity (Break)</label>
                <input
                  name="min_quantity"
                  type="number"
                  min="1"
                  defaultValue="1"
                  className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
              <Button variant="ghost" onClick={() => setAddItemOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addItemMutation.isPending}>
                Save Item Rate
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

