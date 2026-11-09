import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../shared/api/client";
import { Button } from "../../../shared/ui/Button";
import { Modal } from "../../../shared/ui/Modal";
import { EmptyState, LoadingState } from "../../../shared/ui/States";
import type { VendorItem } from "../types";

interface VendorsViewProps {
  companyId: string;
  currencySymbol: string;
  permissions: string[];
}

export function VendorsView({ companyId, currencySymbol, permissions }: VendorsViewProps) {
  const queryClient = useQueryClient();
  const canManage = permissions.includes("commerce.manage.vendors") || permissions.includes("parties.manage") || permissions.includes("commerce.manage");

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

  const vendorsQuery = useQuery({
    queryKey: ["commerce-vendors", companyId, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      return api<{ results: VendorItem[] }>(`/api/v1/companies/${companyId}/commerce/vendors/?${params.toString()}`);
    },
  });

  const vendorDetailQuery = useQuery({
    queryKey: ["commerce-vendor-detail", companyId, selectedVendorId],
    queryFn: () => api<any>(`/api/v1/companies/${companyId}/commerce/vendors/${selectedVendorId}/`),
    enabled: Boolean(selectedVendorId),
  });

  const createVendorMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      api(`/api/v1/companies/${companyId}/commerce/vendors/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce-vendors", companyId] });
      setCreateOpen(false);
    },
  });

  const vendors = vendorsQuery.data?.results ?? [];
  const detail = vendorDetailQuery.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-pulse-ink">Suppliers & Vendors</h2>
          <p className="text-xs text-pulse-muted">
            Vendor directory integrated with shared Parties (ADR-020). Tracks supply partners and linked catalog merchandise.
          </p>
        </div>

        {canManage && (
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Supplier / Vendor
          </Button>
        )}
      </div>

      {/* Search Input */}
      <div className="flex items-center gap-3 rounded-xl border border-pulse-border bg-pulse-surface p-3 shadow-xs">
        <div className="flex-1">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers by name, category, or contact..."
            className="w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink placeholder-pulse-muted focus:border-pulse-accent focus:outline-hidden"
          />
        </div>
      </div>

      {/* Vendors Table */}
      {vendorsQuery.isLoading ? (
        <LoadingState label="Loading suppliers..." />
      ) : vendors.length === 0 ? (
        <EmptyState
          title="No suppliers found"
          body={search ? "No suppliers match your query." : "Register suppliers and linked products."}
          action={canManage ? <Button onClick={() => setCreateOpen(true)}>Add Supplier</Button> : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-pulse-border bg-pulse-surface shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-pulse-border bg-pulse-canvas/50 text-[11px] font-bold text-pulse-muted uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Vendor / Supplier</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3 text-center">Supplied Products</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pulse-border">
              {vendors.map((v) => (
                <tr key={v.id} className="hover:bg-pulse-hover/50 transition">
                  <td className="px-4 py-3 font-bold text-pulse-ink">
                    {v.display_name}
                  </td>
                  <td className="px-4 py-3 text-pulse-muted text-[11px]">
                    {v.email && <div className="text-pulse-ink">{v.email}</div>}
                    {v.phone && <div>{v.phone}</div>}
                    {!v.email && !v.phone && "—"}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-pulse-ink">
                    <span className="rounded-full bg-pulse-hover px-2.5 py-0.5 text-[11px]">
                      {v.supplied_products_count} items
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
                      {v.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedVendorId(v.id)}
                      className="rounded-md border border-pulse-border px-2.5 py-1 text-[11px] font-semibold text-pulse-ink hover:bg-pulse-hover transition"
                    >
                      Supplied Items
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Vendor Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Register Supplier / Vendor">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            createVendorMutation.mutate({
              display_name: String(form.get("display_name")),
              category: String(form.get("category") || "Brand"),
              email: String(form.get("email") || ""),
              phone: String(form.get("phone") || ""),
            });
          }}
        >
          <div>
            <label className="block text-xs font-semibold text-pulse-ink">Supplier / Company Name *</label>
            <input
              name="display_name"
              required
              placeholder="e.g. Coastal Crafts Co or SwiftMove Logistics"
              className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Supplier Category</label>
              <select
                name="category"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              >
                <option value="Brand">Merchandise Brand / Producer</option>
                <option value="Logistics">Logistics & Freight</option>
                <option value="Facilities">Retail Facilities & Fixtures</option>
                <option value="IT">IT & POS Equipment</option>
                <option value="Other">Other Partner</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Contact Phone</label>
              <input
                name="phone"
                placeholder="e.g. 9876543210"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-pulse-ink">Contact Email</label>
            <input
              name="email"
              type="email"
              placeholder="e.g. orders@supplier.example"
              className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createVendorMutation.isPending}>
              Save Supplier
            </Button>
          </div>
        </form>
      </Modal>

      {/* Vendor Detail Modal */}
      {selectedVendorId && (
        <Modal
          open={Boolean(selectedVendorId)}
          onClose={() => setSelectedVendorId(null)}
          title={`Supplier: ${detail?.display_name || "Profile"}`}
        >
          {vendorDetailQuery.isLoading || !detail ? (
            <LoadingState label="Loading supplier details..." />
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-pulse-border bg-pulse-canvas p-3 text-xs space-y-1">
                <div><strong>Email:</strong> {detail.email || "None"}</div>
                <div><strong>Phone:</strong> {detail.phone || "None"}</div>
                <div><strong>Role:</strong> {detail.custom_data?.role || "Vendor"} ({detail.custom_data?.category || "General"})</div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-pulse-ink mb-2">Supplied Catalog Merchandise</h4>
                {detail.supplied_products?.length === 0 ? (
                  <p className="text-xs text-pulse-muted italic">No catalog products currently linked to this supplier.</p>
                ) : (
                  <div className="divide-y divide-pulse-border rounded-lg border border-pulse-border max-h-56 overflow-y-auto">
                    {detail.supplied_products?.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between p-2.5 text-xs">
                        <div>
                          <div className="font-bold text-pulse-ink">{p.name}</div>
                          <div className="text-[11px] text-pulse-muted font-mono">{p.sku}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-pulse-ink">{currencySymbol}{(p.price_minor / 100).toFixed(2)}</div>
                          <div className="text-[10px] text-pulse-muted">Stock: {p.stock_quantity}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-3 border-t border-pulse-border">
                <Button variant="ghost" onClick={() => setSelectedVendorId(null)}>
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

