import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../shared/api/client";
import { Button } from "../../../shared/ui/Button";
import { Modal } from "../../../shared/ui/Modal";
import { EmptyState, LoadingState } from "../../../shared/ui/States";
import type { CustomerItem, OrderDetail, OrderItem, ProductItem } from "../types";

interface OrdersViewProps {
  companyId: string;
  currencySymbol: string;
  permissions: string[];
  initialCreateOpen?: boolean;
}

export function OrdersView({
  companyId,
  currencySymbol,
  permissions,
  initialCreateOpen = false,
}: OrdersViewProps) {
  const queryClient = useQueryClient();
  const can = (code: string) => permissions.includes(code) || permissions.includes("commerce.manage");

  const [activeStatusTab, setActiveStatusTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(initialCreateOpen);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Form State for Order Creation
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [orderLines, setOrderLines] = useState<Array<{ product_id: string; variant_id?: string; quantity: number }>>([
    { product_id: "", quantity: 1 },
  ]);
  const [couponCode, setCouponCode] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [couponError, setCouponError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash_on_delivery");
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [notes, setNotes] = useState("");

  // Queries
  const ordersQuery = useQuery({
    queryKey: ["commerce-orders", companyId, activeStatusTab, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeStatusTab !== "all") params.set("status", activeStatusTab);
      if (search) params.set("search", search);
      return api<{ results: OrderItem[] }>(`/api/v1/companies/${companyId}/commerce/orders/?${params.toString()}`);
    },
  });

  const orderDetailQuery = useQuery({
    queryKey: ["commerce-order-detail", companyId, selectedOrderId],
    queryFn: () => api<OrderDetail>(`/api/v1/companies/${companyId}/commerce/orders/${selectedOrderId}/`),
    enabled: Boolean(selectedOrderId),
  });

  const customersQuery = useQuery({
    queryKey: ["commerce-customers", companyId],
    queryFn: () => api<{ results: CustomerItem[] }>(`/api/v1/companies/${companyId}/commerce/customers/`),
    enabled: createOpen,
  });

  const productsQuery = useQuery({
    queryKey: ["commerce-products", companyId],
    queryFn: () => api<{ results: ProductItem[] }>(`/api/v1/companies/${companyId}/commerce/products/`),
    enabled: createOpen,
  });

  // Mutations
  const createOrderMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      api(`/api/v1/companies/${companyId}/commerce/orders/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce-orders", companyId] });
      queryClient.invalidateQueries({ queryKey: ["commerce-overview", companyId] });
      queryClient.invalidateQueries({ queryKey: ["commerce-inventory", companyId] });
      setCreateOpen(false);
      resetCreateForm();
    },
  });

  const transitionOrderMutation = useMutation({
    mutationFn: ({ orderId, status, notes }: { orderId: string; status: string; notes?: string }) =>
      api(`/api/v1/companies/${companyId}/commerce/orders/${orderId}/transition/`, {
        method: "POST",
        body: JSON.stringify({ status, notes }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce-orders", companyId] });
      queryClient.invalidateQueries({ queryKey: ["commerce-order-detail", companyId, selectedOrderId] });
      queryClient.invalidateQueries({ queryKey: ["commerce-overview", companyId] });
      queryClient.invalidateQueries({ queryKey: ["commerce-inventory", companyId] });
    },
  });

  const validateCouponMutation = useMutation({
    mutationFn: (data: { code: string; subtotal_minor: number; party_id?: string }) =>
      api<{ valid: boolean; discount_minor: number; name: string }>(`/api/v1/companies/${companyId}/commerce/discounts/validate/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      setDiscountAmount(data.discount_minor);
      setCouponError("");
    },
    onError: (err: any) => {
      setCouponError(err.message || "Invalid discount coupon.");
      setDiscountAmount(0);
    },
  });

  const resetCreateForm = () => {
    setSelectedCustomerId("");
    setOrderLines([{ product_id: "", quantity: 1 }]);
    setCouponCode("");
    setDiscountAmount(0);
    setCouponError("");
    setNotes("");
    setAutoConfirm(false);
  };

  const formatMoney = (minor: number) => `${currencySymbol}${(minor / 100).toFixed(2)}`;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "delivered":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300";
      case "shipped":
      case "ready_for_shipment":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300";
      case "processing":
      case "confirmed":
        return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300";
      case "draft":
      case "placed":
        return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300";
      case "cancelled":
      case "returned":
        return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const orders = ordersQuery.data?.results ?? [];
  const customers = customersQuery.data?.results ?? [];
  const products = productsQuery.data?.results ?? [];
  const orderDetail = orderDetailQuery.data;

  // Calculate live order creation estimates
  const productsMap = new Map(products.map((p) => [p.id, p]));
  let calculatedSubtotal = 0;
  let calculatedTax = 0;
  for (const line of orderLines) {
    if (line.product_id) {
      const p = productsMap.get(line.product_id);
      if (p) {
        const lineSub = p.price_minor * line.quantity;
        const lineTax = Math.round(lineSub * (Number(p.tax_rate) / 100));
        calculatedSubtotal += lineSub;
        calculatedTax += lineTax;
      }
    }
  }
  const calculatedTotal = Math.max(0, calculatedSubtotal - discountAmount + calculatedTax);

  const statusTabs = [
    { id: "all", label: "All Orders" },
    { id: "draft", label: "Draft" },
    { id: "confirmed", label: "Confirmed" },
    { id: "processing", label: "Processing" },
    { id: "ready_for_shipment", label: "Ready to Ship" },
    { id: "shipped", label: "Shipped" },
    { id: "delivered", label: "Delivered" },
    { id: "cancelled", label: "Cancelled" },
    { id: "returned", label: "Returned" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-pulse-ink">Sales Order Management</h2>
          <p className="text-xs text-pulse-muted">
            Commercial order processing, multi-line drafting, status progression, fulfillment, and timeline audit logs.
          </p>
        </div>

        {can("commerce.create.orders") && (
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Create Order
          </Button>
        )}
      </div>

      {/* Status Filter Tabs & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pulse-border bg-pulse-surface p-2.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-1">
          {statusTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveStatusTab(tab.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                activeStatusTab === tab.id
                  ? "bg-pulse-accent text-white shadow-xs"
                  : "text-pulse-muted hover:text-pulse-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-w-[200px]">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order # or customer..."
            className="w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1 text-xs text-pulse-ink placeholder-pulse-muted focus:border-pulse-accent focus:outline-hidden"
          />
        </div>
      </div>

      {/* Orders Table */}
      {ordersQuery.isLoading ? (
        <LoadingState label="Loading sales orders..." />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders found"
          body={search ? "No orders match your search." : "No sales orders have been placed in this status."}
          action={can("commerce.create.orders") ? <Button onClick={() => setCreateOpen(true)}>Create Order</Button> : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-pulse-border bg-pulse-surface shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-pulse-border bg-pulse-canvas/50 text-[11px] font-bold text-pulse-muted uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Order Number</th>
                <th className="px-4 py-3">Customer Party</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Payment Status</th>
                <th className="px-4 py-3 text-center">Lines</th>
                <th className="px-4 py-3 text-right">Order Total</th>
                <th className="px-4 py-3 text-right">Placed On</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pulse-border">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-pulse-hover/50 transition">
                  <td className="px-4 py-3 font-mono font-bold text-pulse-ink">
                    {o.order_number || "Draft Order"}
                  </td>
                  <td className="px-4 py-3 font-semibold text-pulse-ink">
                    {o.party}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${getStatusBadge(o.status)}`}>
                      {o.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="capitalize text-[11px] font-medium text-pulse-muted">
                      {o.payment_status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-pulse-muted font-medium">
                    {o.lines_count} item{o.lines_count !== 1 && "s"}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-pulse-ink">
                    {formatMoney(o.total_minor)}
                  </td>
                  <td className="px-4 py-3 text-right text-pulse-muted whitespace-nowrap">
                    {new Date(o.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedOrderId(o.id)}
                      className="rounded-md border border-pulse-border px-2.5 py-1 text-[11px] font-semibold text-pulse-ink hover:bg-pulse-hover transition"
                    >
                      View Order
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Order Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Sales Order">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const validLines = orderLines.filter((l) => l.product_id);
            if (validLines.length === 0) {
              alert("Please add at least one product line.");
              return;
            }
            createOrderMutation.mutate({
              party_id: selectedCustomerId,
              lines: validLines,
              discount_code: couponCode,
              payment_method: paymentMethod,
              notes,
              auto_confirm: autoConfirm,
            });
          }}
        >
          <div>
            <label className="block text-xs font-semibold text-pulse-ink">Customer Party (ADR-020) *</label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
            >
              <option value="">Select a Customer from Parties Directory...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name} ({c.kind}) — {c.email || c.phone || "No contact info"}
                </option>
              ))}
            </select>
          </div>

          {/* Line Items Builder */}
          <div className="space-y-2 border-t border-b border-pulse-border py-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-pulse-ink">Order Items *</label>
              <button
                type="button"
                onClick={() => setOrderLines([...orderLines, { product_id: "", quantity: 1 }])}
                className="text-xs font-semibold text-pulse-accent hover:underline"
              >
                + Add Item Line
              </button>
            </div>

            {orderLines.map((line, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={line.product_id}
                  onChange={(e) => {
                    const next = [...orderLines];
                    next[idx].product_id = e.target.value;
                    setOrderLines(next);
                  }}
                  required
                  className="flex-1 rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
                >
                  <option value="">Select product...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku}) — {formatMoney(p.price_minor)}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  min="1"
                  value={line.quantity}
                  onChange={(e) => {
                    const next = [...orderLines];
                    next[idx].quantity = Math.max(1, Number(e.target.value));
                    setOrderLines(next);
                  }}
                  required
                  className="w-20 rounded-lg border border-pulse-border bg-pulse-canvas px-2.5 py-1.5 text-xs text-pulse-ink text-center focus:border-pulse-accent focus:outline-hidden"
                />

                {orderLines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setOrderLines(orderLines.filter((_, i) => i !== idx))}
                    className="p-1 text-rose-500 hover:text-rose-700"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Discount Coupon & Payment Method */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Discount Coupon Code</label>
              <div className="mt-1 flex gap-2">
                <input
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="e.g. FESTIVE20"
                  className="w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden uppercase"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (couponCode.trim()) {
                      validateCouponMutation.mutate({
                        code: couponCode.trim(),
                        subtotal_minor: calculatedSubtotal,
                        party_id: selectedCustomerId,
                      });
                    }
                  }}
                >
                  Apply
                </Button>
              </div>
              {couponError && <p className="mt-1 text-[11px] text-rose-600">{couponError}</p>}
              {discountAmount > 0 && (
                <p className="mt-1 text-[11px] text-emerald-600 font-semibold">
                  ✓ Discount applied: -{formatMoney(discountAmount)}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              >
                <option value="cash_on_delivery">Cash on Delivery / POS Counter</option>
                <option value="bank_transfer">Direct Bank Transfer / NEFT</option>
                <option value="credit_card">Credit / Debit Card</option>
                <option value="upi">UPI / Instant QR</option>
                <option value="credit_terms">Net 30 Credit Terms (B2B)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-pulse-ink">Order Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Shipping instructions, dispatch references..."
              className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
            />
          </div>

          {/* Live Order Financial Summary Box */}
          <div className="rounded-lg border border-pulse-border bg-pulse-canvas/50 p-3 text-xs space-y-1.5">
            <div className="flex justify-between text-pulse-muted">
              <span>Subtotal:</span>
              <span>{formatMoney(calculatedSubtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600 font-semibold">
                <span>Promotional Discount:</span>
                <span>-{formatMoney(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-pulse-muted">
              <span>Estimated Tax (GST):</span>
              <span>+{formatMoney(calculatedTax)}</span>
            </div>
            <div className="flex justify-between border-t border-pulse-border pt-1.5 font-bold text-pulse-ink text-sm">
              <span>Grand Total:</span>
              <span>{formatMoney(calculatedTotal)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="auto_confirm"
              checked={autoConfirm}
              onChange={(e) => setAutoConfirm(e.target.checked)}
              className="rounded border-pulse-border text-pulse-accent"
            />
            <label htmlFor="auto_confirm" className="text-xs font-medium text-pulse-ink cursor-pointer">
              Auto-confirm order immediately (deducts stock upon creation)
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createOrderMutation.isPending || !selectedCustomerId}>
              {createOrderMutation.isPending ? "Creating Order..." : "Confirm & Save Order"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Order Detail Drawer Modal */}
      {selectedOrderId && (
        <Modal
          open={Boolean(selectedOrderId)}
          onClose={() => setSelectedOrderId(null)}
          title={`Order: ${orderDetail?.order_number || "Draft"}`}
        >
          {orderDetailQuery.isLoading || !orderDetail ? (
            <LoadingState label="Loading order details..." />
          ) : (
            <div className="space-y-4">
              {/* Header Status & Customer */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pulse-border bg-pulse-canvas p-3">
                <div>
                  <div className="text-xs font-bold text-pulse-ink">
                    Customer: {orderDetail.party}
                  </div>
                  <div className="text-[11px] text-pulse-muted">
                    Placed: {new Date(orderDetail.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full border text-xs font-bold uppercase tracking-wider ${getStatusBadge(orderDetail.status)}`}>
                    {orderDetail.status.replace(/_/g, " ")}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-700">
                    Payment: {orderDetail.payment_status}
                  </span>
                </div>
              </div>

              {/* Order Lines Breakdown */}
              <div>
                <h4 className="text-xs font-bold text-pulse-ink mb-2">Order Line Items</h4>
                <div className="divide-y divide-pulse-border rounded-lg border border-pulse-border">
                  {orderDetail.lines?.map((line) => (
                    <div key={line.id} className="flex items-center justify-between p-3 text-xs">
                      <div>
                        <div className="font-bold text-pulse-ink">{line.product_name}</div>
                        <div className="text-[11px] text-pulse-muted font-mono">{line.product_sku}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-pulse-ink">
                          {line.quantity} × {formatMoney(line.unit_price_minor)}
                        </div>
                        <div className="text-[11px] text-pulse-muted">
                          Total: {formatMoney(line.total_minor)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Totals */}
              <div className="rounded-lg border border-pulse-border p-3 text-xs space-y-1">
                <div className="flex justify-between text-pulse-muted">
                  <span>Subtotal:</span>
                  <span>{formatMoney(orderDetail.subtotal_minor)}</span>
                </div>
                {orderDetail.discount_minor > 0 && (
                  <div className="flex justify-between text-emerald-600 font-semibold">
                    <span>Discount ({orderDetail.discount_code}):</span>
                    <span>-{formatMoney(orderDetail.discount_minor)}</span>
                  </div>
                )}
                <div className="flex justify-between text-pulse-muted">
                  <span>Tax:</span>
                  <span>+{formatMoney(orderDetail.tax_minor)}</span>
                </div>
                <div className="flex justify-between border-t border-pulse-border pt-1 font-bold text-sm text-pulse-ink">
                  <span>Total Amount:</span>
                  <span>{formatMoney(orderDetail.total_minor)}</span>
                </div>
              </div>

              {/* Timeline & Audit Activities */}
              <div>
                <h4 className="text-xs font-bold text-pulse-ink mb-2">Order Activity Timeline</h4>
                <div className="space-y-2">
                  {orderDetail.activities?.map((act) => (
                    <div key={act.id} className="flex items-start gap-2.5 text-xs text-pulse-ink">
                      <div className="h-2 w-2 rounded-full bg-pulse-accent mt-1.5 shrink-0" />
                      <div>
                        <span className="font-semibold">{act.notes || act.action}</span>
                        <span className="text-[10px] text-pulse-muted block">
                          By {act.actor_name} on {new Date(act.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status Transition Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-pulse-border">
                <div className="flex flex-wrap gap-2">
                  {orderDetail.status === "draft" && can("commerce.confirm.orders") && (
                    <Button
                      size="sm"
                      onClick={() => transitionOrderMutation.mutate({ orderId: orderDetail.id, status: "confirmed" })}
                    >
                      Confirm Order
                    </Button>
                  )}
                  {orderDetail.status === "confirmed" && (
                    <Button
                      size="sm"
                      onClick={() => transitionOrderMutation.mutate({ orderId: orderDetail.id, status: "processing" })}
                    >
                      Process Fulfillment
                    </Button>
                  )}
                  {orderDetail.status === "processing" && (
                    <Button
                      size="sm"
                      onClick={() => transitionOrderMutation.mutate({ orderId: orderDetail.id, status: "ready_for_shipment" })}
                    >
                      Mark Ready to Ship
                    </Button>
                  )}
                  {orderDetail.status === "ready_for_shipment" && (
                    <Button
                      size="sm"
                      onClick={() => transitionOrderMutation.mutate({ orderId: orderDetail.id, status: "shipped" })}
                    >
                      Dispatch & Ship
                    </Button>
                  )}
                  {orderDetail.status === "shipped" && (
                    <Button
                      size="sm"
                      onClick={() => transitionOrderMutation.mutate({ orderId: orderDetail.id, status: "delivered" })}
                    >
                      Mark Delivered
                    </Button>
                  )}
                  {["draft", "confirmed", "processing", "ready_for_shipment"].includes(orderDetail.status) &&
                    can("commerce.cancel.orders") && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("Cancel this order? If confirmed, allocated stock will be restored.")) {
                            transitionOrderMutation.mutate({ orderId: orderDetail.id, status: "cancelled" });
                          }
                        }}
                        className="rounded-md border border-pulse-border px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
                      >
                        Cancel Order
                      </button>
                    )}
                </div>

                <Button variant="ghost" onClick={() => setSelectedOrderId(null)}>
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
