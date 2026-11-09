import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../shared/api/client";
import { Button } from "../../../shared/ui/Button";
import { Modal } from "../../../shared/ui/Modal";
import { EmptyState, LoadingState } from "../../../shared/ui/States";
import type { ProductItem, StockMovementItem } from "../types";

interface InventoryViewProps {
  companyId: string;
  currencySymbol: string;
  permissions: string[];
  initialAdjustOpen?: boolean;
  initialProductId?: string;
}

export function InventoryView({
  companyId,
  currencySymbol,
  permissions,
  initialAdjustOpen = false,
  initialProductId,
}: InventoryViewProps) {
  const queryClient = useQueryClient();
  const canUpdate = permissions.includes("commerce.update.products") || permissions.includes("commerce.manage");

  const [adjustOpen, setAdjustOpen] = useState(initialAdjustOpen);
  const [selectedProductId, setSelectedProductId] = useState<string>(initialProductId || "");
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  const inventoryQuery = useQuery({
    queryKey: ["commerce-inventory", companyId],
    queryFn: () =>
      api<{
        inventory_summary: {
          total_tracked_items: number;
          total_stock_units: number;
          low_stock_items: number;
          total_valuation_minor: number;
        };
        items: Array<{
          id: string;
          name: string;
          sku: string;
          category_name: string;
          stock_quantity: number;
          reserved_quantity: number;
          available_stock: number;
          low_stock_threshold: number;
          is_low_stock: boolean;
          uom: string;
          cost_price_minor: number;
          valuation_minor: number;
        }>;
        recent_movements: StockMovementItem[];
        integration_status: {
          inventory_module_installed: boolean;
          notice: string;
        };
      }>(`/api/v1/companies/${companyId}/commerce/inventory/`),
  });

  const productsQuery = useQuery({
    queryKey: ["commerce-products", companyId],
    queryFn: () => api<{ results: ProductItem[] }>(`/api/v1/companies/${companyId}/commerce/products/`),
    enabled: adjustOpen,
  });

  const adjustStockMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      api(`/api/v1/companies/${companyId}/commerce/inventory/adjust/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce-inventory", companyId] });
      queryClient.invalidateQueries({ queryKey: ["commerce-products", companyId] });
      queryClient.invalidateQueries({ queryKey: ["commerce-overview", companyId] });
      setAdjustOpen(false);
    },
  });

  const formatMoney = (minor: number) => `${currencySymbol}${(minor / 100).toFixed(2)}`;

  const invData = inventoryQuery.data;
  const summary = invData?.inventory_summary;
  const items = (invData?.items ?? []).filter((item) => (onlyLowStock ? item.is_low_stock : true));
  const movements = invData?.recent_movements ?? [];
  const products = productsQuery.data?.results ?? [];

  return (
    <div className="space-y-5">
      {/* Header and Stock In action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-pulse-ink">Inventory & Stock Tracking</h2>
          <p className="text-xs text-pulse-muted">
            Track on-hand stock, reserves, availability, valuation, and physical stock movement audit logs.
          </p>
        </div>

        {canUpdate && (
          <Button onClick={() => setAdjustOpen(true)} className="gap-1.5">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Record Stock In / Adjustment
          </Button>
        )}
      </div>

      {/* Standalone Warehousing Dependency Notice per Section 8 */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 dark:border-sky-900/50 dark:bg-sky-950/20 text-xs flex items-start gap-3">
        <div className="rounded-lg bg-sky-100 p-1.5 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 shrink-0">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <span className="font-bold text-sky-900 dark:text-sky-200 block mb-0.5">
            Native Commerce Stock Tracking Active
          </span>
          <span className="text-sky-800/90 dark:text-sky-300/90">
            Commerce maintains atomic stock deductions, reservations, and inventory logs directly. Multi-warehouse routing, bin locations, and automated reorder points will synchronize when the separate <strong>Inventory & Warehousing</strong> module is enabled in the Marketplace.
          </span>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-pulse-border bg-pulse-surface p-4 shadow-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-pulse-muted">Tracked Products</span>
            <div className="mt-1 text-xl font-bold text-pulse-ink">{summary.total_tracked_items}</div>
            <p className="mt-0.5 text-[10px] text-pulse-muted">Active inventory items</p>
          </div>
          <div className="rounded-xl border border-pulse-border bg-pulse-surface p-4 shadow-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-pulse-muted">Total Stock Units</span>
            <div className="mt-1 text-xl font-bold text-pulse-ink">{summary.total_stock_units}</div>
            <p className="mt-0.5 text-[10px] text-pulse-muted">Physical units on hand</p>
          </div>
          <div className="rounded-xl border border-pulse-border bg-pulse-surface p-4 shadow-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-pulse-muted">Low Stock Alerts</span>
            <div className={`mt-1 text-xl font-bold ${summary.low_stock_items > 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {summary.low_stock_items}
            </div>
            <p className="mt-0.5 text-[10px] text-rose-600 font-medium">At or below threshold</p>
          </div>
          <div className="rounded-xl border border-pulse-border bg-pulse-surface p-4 shadow-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-pulse-muted">Inventory Valuation</span>
            <div className="mt-1 text-xl font-bold text-teal-600 dark:text-teal-400">
              {formatMoney(summary.total_valuation_minor)}
            </div>
            <p className="mt-0.5 text-[10px] text-pulse-muted">At recorded cost price</p>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex items-center justify-between rounded-xl border border-pulse-border bg-pulse-surface p-3 shadow-xs">
        <label className="flex items-center gap-2 text-xs font-semibold text-pulse-ink cursor-pointer">
          <input
            type="checkbox"
            checked={onlyLowStock}
            onChange={(e) => setOnlyLowStock(e.target.checked)}
            className="rounded border-pulse-border text-pulse-accent"
          />
          <span>Show items requiring replenishment only ({summary?.low_stock_items || 0})</span>
        </label>
      </div>

      {/* Stock Levels Table */}
      {inventoryQuery.isLoading ? (
        <LoadingState label="Loading stock records..." />
      ) : items.length === 0 ? (
        <EmptyState title="No inventory items found" body="All products currently have adequate stock." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-pulse-border bg-pulse-surface shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-pulse-border bg-pulse-canvas/50 text-[11px] font-bold text-pulse-muted uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3 text-right">Unit Cost</th>
                <th className="px-4 py-3 text-center">On Hand</th>
                <th className="px-4 py-3 text-center">Reserved</th>
                <th className="px-4 py-3 text-center">Available</th>
                <th className="px-4 py-3 text-center">Alert Level</th>
                <th className="px-4 py-3 text-right">Valuation</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pulse-border">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-pulse-hover/50 transition">
                  <td className="px-4 py-3">
                    <div className="font-bold text-pulse-ink">{item.name}</div>
                    <div className="text-[11px] text-pulse-muted">{item.category_name}</div>
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold text-pulse-ink text-[11px]">{item.sku}</td>
                  <td className="px-4 py-3 text-right text-pulse-muted">{formatMoney(item.cost_price_minor)}</td>
                  <td className="px-4 py-3 text-center font-bold text-pulse-ink">
                    {item.stock_quantity} {item.uom}
                  </td>
                  <td className="px-4 py-3 text-center text-pulse-muted">
                    {item.reserved_quantity} {item.uom}
                  </td>
                  <td className="px-4 py-3 text-center font-bold">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[11px] ${
                        item.is_low_stock
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      }`}
                    >
                      {item.available_stock} {item.uom}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-pulse-muted">
                    {item.low_stock_threshold} {item.uom}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-pulse-ink">
                    {formatMoney(item.valuation_minor)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canUpdate && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProductId(item.id);
                          setAdjustOpen(true);
                        }}
                        className="rounded-md border border-pulse-border px-2.5 py-1 text-[11px] font-semibold text-pulse-ink hover:bg-pulse-hover transition"
                      >
                        Adjust
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent Stock Movement Audit Logs */}
      <div className="rounded-xl border border-pulse-border bg-pulse-surface p-5 shadow-xs">
        <h3 className="text-sm font-bold text-pulse-ink mb-1">Stock Movement Audit Trail</h3>
        <p className="text-xs text-pulse-muted mb-4">
          Immutable log of inventory receipts, order fulfillment deductions, and manual count corrections.
        </p>

        {movements.length === 0 ? (
          <p className="text-xs text-pulse-muted italic">No stock adjustments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-pulse-border text-[11px] font-semibold text-pulse-muted">
                <tr>
                  <th className="py-2">Timestamp</th>
                  <th className="py-2">Product</th>
                  <th className="py-2">Type</th>
                  <th className="py-2 text-right">Change</th>
                  <th className="py-2 text-right">Stock (Before → After)</th>
                  <th className="py-2">Reference</th>
                  <th className="py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pulse-border">
                {movements.map((m) => (
                  <tr key={m.id} className="text-pulse-ink">
                    <td className="py-2 text-pulse-muted whitespace-nowrap">
                      {new Date(m.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 font-semibold">{m.product_name}</td>
                    <td className="py-2 capitalize font-medium">{m.movement_type.replace(/_/g, " ")}</td>
                    <td className={`py-2 text-right font-bold ${m.quantity > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </td>
                    <td className="py-2 text-right text-pulse-muted font-mono">
                      {m.quantity_before} → {m.quantity_after}
                    </td>
                    <td className="py-2 text-pulse-muted">{m.reference_id || m.reference_type || "—"}</td>
                    <td className="py-2 text-pulse-muted line-clamp-1">{m.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Stock Adjustment Modal */}
      <Modal open={adjustOpen} onClose={() => setAdjustOpen(false)} title="Record Stock Adjustment / Receipt">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const delta = Number(form.get("quantity") || 0);
            const type = String(form.get("movement_type") || "in");
            // If movement is OUT or FULFILLMENT, negate delta
            const actualDelta = type === "out" ? -Math.abs(delta) : Math.abs(delta);

            adjustStockMutation.mutate({
              product_id: String(form.get("product_id")),
              quantity: actualDelta,
              movement_type: type,
              notes: String(form.get("notes") || ""),
            });
          }}
        >
          <div>
            <label className="block text-xs font-semibold text-pulse-ink">Select Product *</label>
            <select
              name="product_id"
              required
              defaultValue={selectedProductId}
              className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
            >
              <option value="">Select a product...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku}) — Current Stock: {p.stock_quantity} {p.uom}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Movement Direction *</label>
              <select
                name="movement_type"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              >
                <option value="in">Stock In (Receipt / Delivery)</option>
                <option value="out">Stock Out (Damage / Loss / Write-off)</option>
                <option value="adjustment">Manual Count Adjustment</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Quantity Units *</label>
              <input
                name="quantity"
                type="number"
                min="1"
                required
                defaultValue="10"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-pulse-ink">Reason / Purchase Reference</label>
            <textarea
              name="notes"
              rows={2}
              placeholder="e.g. PO-8891 vendor delivery received at warehouse"
              className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
            <Button variant="ghost" onClick={() => setAdjustOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={adjustStockMutation.isPending}>
              {adjustStockMutation.isPending ? "Recording..." : "Apply Adjustment"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

