import type { CommerceNavTab, CommerceOverviewData } from "../types";

interface OverviewViewProps {
  data: CommerceOverviewData;
  currency?: string;
  currencySymbol: string;
  onNavigateTab: (tab: CommerceNavTab, queryParams?: Record<string, string>) => void;
  onDateFilterChange: (filter: string) => void;
  dateFilter: string;
  permissions: string[];
}

export function OverviewView({
  data,
  currencySymbol,
  onNavigateTab,
  onDateFilterChange,
  dateFilter,
  permissions,
}: OverviewViewProps) {
  const can = (code: string) => permissions.includes(code) || permissions.includes("commerce.manage");
  const { kpis, sales_trend, orders_by_status, sales_by_category, top_selling_products, top_customers, recent_orders, low_stock_alerts, pending_returns } = data;

  const formatMoney = (minor: number) => {
    return `${currencySymbol}${(minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

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
        return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300";
    }
  };

  // Find max sales for bar chart normalization
  const maxTrendSales = Math.max(...sales_trend.map((d) => d.sales_minor), 10000);

  return (
    <div className="space-y-6">
      {/* Header bar with title, date filters, and primary action */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-pulse-ink">Commerce Overview</h1>
          <p className="text-xs text-pulse-muted">
            Executive sales metrics, catalog inventory, order desk flow, and operational alerts.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="inline-flex rounded-lg border border-pulse-border bg-pulse-surface p-1 shadow-xs">
            {[
              { id: "today", label: "Today" },
              { id: "7d", label: "7 Days" },
              { id: "30d", label: "30 Days" },
              { id: "year", label: "This Year" },
              { id: "all", label: "All Time" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onDateFilterChange(f.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                  dateFilter === f.id
                    ? "bg-pulse-accent text-white shadow-xs"
                    : "text-pulse-muted hover:text-pulse-ink"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {can("commerce.create.orders") && (
            <button
              type="button"
              onClick={() => onNavigateTab("orders", { action: "create" })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-pulse-accent px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-pulse-accent-strong transition"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>Create Order</span>
            </button>
          )}
        </div>
      </div>

      {/* 6 KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Card 1: Total Sales */}
        <div className="rounded-xl border border-pulse-border bg-pulse-surface p-4 shadow-xs">
          <div className="flex items-center justify-between text-pulse-muted">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Sales</span>
            <div className="rounded-lg bg-teal-50 p-1.5 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-lg font-bold text-pulse-ink">{formatMoney(kpis.total_sales_minor)}</div>
          <p className="mt-0.5 text-[10px] text-teal-600 dark:text-teal-400 font-medium">Realized revenue</p>
        </div>

        {/* Card 2: Total Orders */}
        <div className="rounded-xl border border-pulse-border bg-pulse-surface p-4 shadow-xs">
          <div className="flex items-center justify-between text-pulse-muted">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Orders</span>
            <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-lg font-bold text-pulse-ink">{kpis.total_orders}</div>
          <p className="mt-0.5 text-[10px] text-pulse-muted font-medium">Recorded sales orders</p>
        </div>

        {/* Card 3: Total Customers */}
        <div className="rounded-xl border border-pulse-border bg-pulse-surface p-4 shadow-xs">
          <div className="flex items-center justify-between text-pulse-muted">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Customers</span>
            <div className="rounded-lg bg-purple-50 p-1.5 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-lg font-bold text-pulse-ink">{kpis.total_customers}</div>
          <p className="mt-0.5 text-[10px] text-purple-600 dark:text-purple-400 font-medium">Shared Party accounts</p>
        </div>

        {/* Card 4: Total Products */}
        <div className="rounded-xl border border-pulse-border bg-pulse-surface p-4 shadow-xs">
          <div className="flex items-center justify-between text-pulse-muted">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Catalog Items</span>
            <div className="rounded-lg bg-amber-50 p-1.5 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-lg font-bold text-pulse-ink">{kpis.total_products}</div>
          <p className="mt-0.5 text-[10px] text-pulse-muted font-medium">Active products & SKUs</p>
        </div>

        {/* Card 5: Pending Orders */}
        <div className="rounded-xl border border-pulse-border bg-pulse-surface p-4 shadow-xs">
          <div className="flex items-center justify-between text-pulse-muted">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Pending Orders</span>
            <div className="rounded-lg bg-sky-50 p-1.5 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-lg font-bold text-sky-600 dark:text-sky-400">{kpis.pending_orders}</div>
          <p className="mt-0.5 text-[10px] text-pulse-muted font-medium">Awaiting fulfillment</p>
        </div>

        {/* Card 6: Low Stock Products */}
        <div className="rounded-xl border border-pulse-border bg-pulse-surface p-4 shadow-xs">
          <div className="flex items-center justify-between text-pulse-muted">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Low Stock</span>
            <div className={`rounded-lg p-1.5 ${kpis.low_stock_products > 0 ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400" : "bg-emerald-50 text-emerald-600"}`}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          </div>
          <div className={`mt-2 text-lg font-bold ${kpis.low_stock_products > 0 ? "text-rose-600 dark:text-rose-400" : "text-pulse-ink"}`}>
            {kpis.low_stock_products}
          </div>
          <p className="mt-0.5 text-[10px] text-rose-600 dark:text-rose-400 font-medium">Below alert threshold</p>
        </div>
      </div>

      {/* Quick Action Buttons Bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-pulse-border bg-pulse-surface p-2.5 shadow-xs">
        <span className="px-2 text-xs font-bold text-pulse-muted">Quick Actions:</span>
        <button
          type="button"
          onClick={() => onNavigateTab("products", { action: "create" })}
          className="rounded-lg border border-pulse-border px-3 py-1 text-xs font-semibold text-pulse-ink hover:bg-pulse-hover transition"
        >
          + Add Product
        </button>
        <button
          type="button"
          onClick={() => onNavigateTab("orders", { action: "create" })}
          className="rounded-lg border border-pulse-border px-3 py-1 text-xs font-semibold text-pulse-ink hover:bg-pulse-hover transition"
        >
          + Create Order
        </button>
        <button
          type="button"
          onClick={() => onNavigateTab("customers", { action: "create" })}
          className="rounded-lg border border-pulse-border px-3 py-1 text-xs font-semibold text-pulse-ink hover:bg-pulse-hover transition"
        >
          + Add Customer
        </button>
        <button
          type="button"
          onClick={() => onNavigateTab("price_lists", { action: "create" })}
          className="rounded-lg border border-pulse-border px-3 py-1 text-xs font-semibold text-pulse-ink hover:bg-pulse-hover transition"
        >
          + Create Price List
        </button>
        <button
          type="button"
          onClick={() => onNavigateTab("inventory", { action: "adjust" })}
          className="rounded-lg border border-pulse-border px-3 py-1 text-xs font-semibold text-pulse-ink hover:bg-pulse-hover transition"
        >
          Stock In / Adjustment
        </button>
        <button
          type="button"
          onClick={() => onNavigateTab("discounts", { action: "create" })}
          className="rounded-lg border border-pulse-border px-3 py-1 text-xs font-semibold text-pulse-ink hover:bg-pulse-hover transition"
        >
          Create Discount
        </button>
        <button
          type="button"
          onClick={() => onNavigateTab("reports")}
          className="rounded-lg border border-pulse-border px-3 py-1 text-xs font-semibold text-pulse-ink hover:bg-pulse-hover transition"
        >
          View Reports
        </button>
      </div>

      {/* Analytics Grid: Sales Trend & Category Share */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Sales Trend Chart */}
        <div className="rounded-xl border border-pulse-border bg-pulse-surface p-5 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-pulse-ink">Sales Revenue Trend</h2>
              <p className="text-xs text-pulse-muted">Daily realized sales volume for the active period</p>
            </div>
            <span className="text-xs font-bold text-teal-600 bg-teal-50 dark:bg-teal-950/40 px-2 py-0.5 rounded-md border border-teal-200/50">
              {formatMoney(kpis.total_sales_minor)}
            </span>
          </div>

          {/* Bar Chart Visualizer */}
          <div className="h-44 flex items-end gap-2 pt-4 px-2 border-b border-pulse-border">
            {sales_trend.map((point, idx) => {
              const heightPct = Math.max(8, Math.round((point.sales_minor / maxTrendSales) * 100));
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 group relative">
                  <div className="text-[10px] font-medium text-pulse-muted opacity-0 group-hover:opacity-100 transition absolute -top-5">
                    {formatMoney(point.sales_minor)}
                  </div>
                  <div
                    style={{ height: `${heightPct}%` }}
                    className="w-full rounded-t-md bg-pulse-accent group-hover:bg-pulse-accent-strong transition"
                  />
                  <span className="text-[10px] text-pulse-muted truncate w-full text-center">
                    {point.date}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-pulse-muted">
            <span>7-day operational baseline</span>
            <span>{kpis.total_orders} total orders recorded</span>
          </div>
        </div>

        {/* Order Status Breakdown & Category Share */}
        <div className="rounded-xl border border-pulse-border bg-pulse-surface p-5 shadow-xs space-y-5">
          <div>
            <h2 className="text-sm font-bold text-pulse-ink">Orders by Status</h2>
            <p className="text-xs text-pulse-muted mb-3">Live workflow distribution</p>

            <div className="space-y-2">
              {Object.entries(orders_by_status).length === 0 ? (
                <p className="text-xs text-pulse-muted italic">No orders recorded yet.</p>
              ) : (
                Object.entries(orders_by_status).map(([st, cnt]) => (
                  <div key={st} className="flex items-center justify-between text-xs">
                    <span className={`capitalize font-semibold px-2 py-0.5 rounded-full border text-[11px] ${getStatusBadge(st)}`}>
                      {st.replace(/_/g, " ")}
                    </span>
                    <span className="font-bold text-pulse-ink">{cnt}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="border-t border-pulse-border pt-4">
            <h2 className="text-sm font-bold text-pulse-ink">Sales by Category</h2>
            <p className="text-xs text-pulse-muted mb-3">Top merchandise categories</p>

            <div className="space-y-2">
              {sales_by_category.length === 0 ? (
                <p className="text-xs text-pulse-muted italic">No category sales recorded yet.</p>
              ) : (
                sales_by_category.map((cat, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span className="text-pulse-ink font-medium truncate max-w-[150px]">{cat.category}</span>
                    <span className="font-semibold text-pulse-muted">{formatMoney(cat.total_minor)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Operational Sections: Recent Orders & Low-Stock Alerts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Orders Table */}
        <div className="rounded-xl border border-pulse-border bg-pulse-surface p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-pulse-ink">Recent Sales Orders</h2>
              <p className="text-xs text-pulse-muted">Latest commercial transactions</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("orders")}
              className="text-xs font-semibold text-pulse-accent hover:underline"
            >
              View all orders →
            </button>
          </div>

          {recent_orders.length === 0 ? (
            <div className="py-8 text-center text-xs text-pulse-muted">
              No sales orders placed yet. Click "+ Create Order" to begin.
            </div>
          ) : (
            <div className="divide-y divide-pulse-border">
              {recent_orders.map((order) => (
                <div key={order.id} className="flex items-center justify-between py-2.5 text-xs">
                  <div>
                    <div className="font-bold text-pulse-ink">{order.order_number || "Draft Order"}</div>
                    <div className="text-pulse-muted text-[11px]">{order.customer_name}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${getStatusBadge(order.status)}`}>
                      {order.status}
                    </span>
                    <span className="font-bold text-pulse-ink min-w-[70px] text-right">
                      {formatMoney(order.total_minor)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Low-Stock Alerts */}
        <div className="rounded-xl border border-pulse-border bg-pulse-surface p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-pulse-ink">Low-Stock Alerts</h2>
              <p className="text-xs text-pulse-muted">Inventory items at or below reorder threshold</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("inventory")}
              className="text-xs font-semibold text-pulse-accent hover:underline"
            >
              Inventory desk →
            </button>
          </div>

          {low_stock_alerts.length === 0 ? (
            <div className="py-8 text-center text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              ✓ All tracked products have sufficient stock levels above threshold.
            </div>
          ) : (
            <div className="divide-y divide-pulse-border">
              {low_stock_alerts.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2.5 text-xs">
                  <div>
                    <div className="font-bold text-pulse-ink">{item.name}</div>
                    <div className="text-pulse-muted text-[11px]">{item.sku}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-rose-600 font-bold">{item.available_stock} {item.uom}</span>
                      <span className="text-pulse-muted text-[11px] block">min: {item.low_stock_threshold}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigateTab("inventory", { action: "adjust", product_id: item.id })}
                      className="rounded-md bg-pulse-surface border border-pulse-border px-2 py-1 text-[11px] font-semibold text-pulse-ink hover:bg-pulse-hover transition"
                    >
                      Stock In
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top Products, Top Customers, and Pending Returns Section */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Best-Selling Products */}
        <div className="rounded-xl border border-pulse-border bg-pulse-surface p-5 shadow-xs">
          <h2 className="text-sm font-bold text-pulse-ink mb-1">Best-Selling Products</h2>
          <p className="text-xs text-pulse-muted mb-3">Highest revenue generators</p>

          <div className="space-y-2.5">
            {top_selling_products.length === 0 ? (
              <p className="text-xs text-pulse-muted italic">No sales recorded yet.</p>
            ) : (
              top_selling_products.map((p, idx) => (
                <div key={p.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-pulse-muted w-4">{idx + 1}.</span>
                    <div>
                      <div className="font-semibold text-pulse-ink truncate max-w-[130px]">{p.name}</div>
                      <div className="text-[10px] text-pulse-muted">{p.units_sold} units sold</div>
                    </div>
                  </div>
                  <span className="font-bold text-pulse-ink">{formatMoney(p.revenue_minor)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Customers */}
        <div className="rounded-xl border border-pulse-border bg-pulse-surface p-5 shadow-xs">
          <h2 className="text-sm font-bold text-pulse-ink mb-1">Top Customers</h2>
          <p className="text-xs text-pulse-muted mb-3">By cumulative order spend</p>

          <div className="space-y-2.5">
            {top_customers.length === 0 ? (
              <p className="text-xs text-pulse-muted italic">No customer orders recorded yet.</p>
            ) : (
              top_customers.map((c, idx) => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-pulse-muted w-4">{idx + 1}.</span>
                    <div>
                      <div className="font-semibold text-pulse-ink truncate max-w-[130px]">{c.name}</div>
                      <div className="text-[10px] text-pulse-muted">{c.orders_count} orders</div>
                    </div>
                  </div>
                  <span className="font-bold text-pulse-ink">{formatMoney(c.total_spent_minor)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Returns Awaiting Processing */}
        <div className="rounded-xl border border-pulse-border bg-pulse-surface p-5 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold text-pulse-ink">Pending Returns</h2>
            <button
              type="button"
              onClick={() => onNavigateTab("returns")}
              className="text-xs font-semibold text-pulse-accent hover:underline"
            >
              Manage →
            </button>
          </div>
          <p className="text-xs text-pulse-muted mb-3">Return & refund queue</p>

          <div className="space-y-2.5">
            {pending_returns.length === 0 ? (
              <p className="text-xs text-pulse-muted italic">No returns currently awaiting action.</p>
            ) : (
              pending_returns.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-pulse-ink">{r.return_number}</div>
                    <div className="text-[10px] text-pulse-muted">{r.customer_name} · {r.reason}</div>
                  </div>
                  <span className="font-bold text-rose-600">{formatMoney(r.refund_amount_minor)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
