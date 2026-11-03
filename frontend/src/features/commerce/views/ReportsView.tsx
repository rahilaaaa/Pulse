import { useState, useEffect } from "react";
import { CommerceOverviewData } from "../types";
import { formatMinorUnits } from "../utils";

interface ReportsViewProps {
  companyId: string;
}

export function ReportsView({ companyId }: ReportsViewProps) {
  const [reportType, setReportType] = useState<"sales" | "products" | "returns" | "inventory">("sales");
  const [data, setData] = useState<{ overview: CommerceOverviewData; generated_at: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `/api/v1/companies/${companyId}/commerce/reports/?report_type=${reportType}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load reports data");
      const json = await res.json();
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error fetching reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [companyId, reportType]);

  const handleExportCsv = () => {
    window.open(
      `/api/v1/companies/${companyId}/commerce/reports/?export=csv&report_type=${reportType}`,
      "_blank"
    );
  };

  const overview = data?.overview;
  const currency = overview?.kpis?.currency || "INR";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Commerce Reports & Audits</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Generate and export operational statements, sales performance, returns, and inventory valuations.
          </p>
        </div>
        <button
          onClick={handleExportCsv}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg shadow-sm text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          <svg className="w-4 h-4 mr-1.5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Export CSV Statement
        </button>
      </div>

      {/* Report Selector Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-700 pb-3">
        {[
          { id: "sales", label: "Sales & Revenue Audit" },
          { id: "products", label: "Product Performance" },
          { id: "returns", label: "Returns & Refund Ledger" },
          { id: "inventory", label: "Inventory Valuation" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setReportType(tab.id as "sales" | "products" | "returns" | "inventory")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              reportType === tab.id
                ? "bg-teal-600 text-white shadow-xs"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400">Compiling financial data & statistics...</div>
      ) : error ? (
        <div className="p-6 bg-red-50 text-red-700 rounded-lg">{error}</div>
      ) : !overview ? (
        <div className="p-12 text-center text-slate-400">No report data available.</div>
      ) : (
        <div className="space-y-6">
          {/* Sales Report View */}
          {reportType === "sales" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-xs font-semibold text-slate-400 uppercase">Gross Revenue</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                    {formatMinorUnits(overview.kpis.total_sales_minor, currency)}
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-xs font-semibold text-slate-400 uppercase">Total Orders Fulfilled</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                    {overview.kpis.total_orders}
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-xs font-semibold text-slate-400 uppercase">Average Order Value</div>
                  <div className="text-2xl font-bold text-teal-600 mt-1">
                    {overview.kpis.total_orders > 0
                      ? formatMinorUnits(
                          Math.round(overview.kpis.total_sales_minor / overview.kpis.total_orders),
                          currency
                        )
                      : "₹0.00"}
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-xs font-semibold text-slate-400 uppercase">Active Accounts</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                    {overview.kpis.total_customers}
                  </div>
                </div>
              </div>

              {/* Order Status Breakdown */}
              <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700">
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
                  Order Status Distribution
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {Object.entries(overview.orders_by_status).map(([status, count]) => (
                    <div
                      key={status}
                      className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700"
                    >
                      <div className="text-xs text-slate-500 capitalize">{status.replace("_", " ")}</div>
                      <div className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-1">{count}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Orders Statement */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-800 dark:text-slate-100">
                  Latest Sales Transactions
                </div>
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs text-slate-500 uppercase">
                    <tr>
                      <th className="px-6 py-3">Order Number</th>
                      <th className="px-6 py-3">Date</th>
                      <th className="px-6 py-3">Customer</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Order Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {overview.recent_orders.map((o) => (
                      <tr key={o.id}>
                        <td className="px-6 py-3 font-mono font-medium text-slate-900 dark:text-white">
                          {o.order_number}
                        </td>
                        <td className="px-6 py-3 text-xs text-slate-500">
                          {new Date(o.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3 text-slate-700 dark:text-slate-300">{o.customer_name}</td>
                        <td className="px-6 py-3 capitalize text-xs">{o.status}</td>
                        <td className="px-6 py-3 text-right font-semibold">
                          {formatMinorUnits(o.total_minor, o.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Product Performance Report View */}
          {reportType === "products" && (
            <>
              <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700">
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
                  Top Performing Products by Revenue
                </h3>
                {overview.top_selling_products.length === 0 ? (
                  <p className="text-slate-400 text-sm">No sales recorded yet for catalogue items.</p>
                ) : (
                  <div className="space-y-4">
                    {overview.top_selling_products.map((p, idx) => (
                      <div key={p.id} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            #{idx + 1} {p.name}{" "}
                            <span className="text-xs text-slate-400 font-mono">({p.sku})</span>
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {formatMinorUnits(p.revenue_minor, currency)} ({p.units_sold} units)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                          <div
                            className="bg-teal-500 h-2.5 rounded-full"
                            style={{
                              width: `${Math.min(
                                100,
                                (p.revenue_minor / (overview.kpis.total_sales_minor || 1)) * 100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Category Breakdown */}
              <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700">
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
                  Sales Contribution by Category
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {overview.sales_by_category.map((cat) => (
                    <div
                      key={cat.category}
                      className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700"
                    >
                      <div className="text-xs font-semibold text-slate-500 uppercase">{cat.category}</div>
                      <div className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                        {formatMinorUnits(cat.total_minor, currency)}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{cat.quantity} units sold</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Returns & Refund Ledger */}
          {reportType === "returns" && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-800 dark:text-slate-100 flex justify-between">
                <span>Returns Awaiting Processing</span>
                <span className="text-xs font-normal text-slate-400">
                  {overview.pending_returns.length} pending actions
                </span>
              </div>
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="px-6 py-3">Return Number</th>
                    <th className="px-6 py-3">Order Number</th>
                    <th className="px-6 py-3">Customer</th>
                    <th className="px-6 py-3">Reason</th>
                    <th className="px-6 py-3 text-right">Refund Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {overview.pending_returns.map((ret) => (
                    <tr key={ret.id}>
                      <td className="px-6 py-3 font-mono font-medium text-slate-900 dark:text-white">
                        {ret.return_number}
                      </td>
                      <td className="px-6 py-3 font-mono text-teal-600">{ret.order_number}</td>
                      <td className="px-6 py-3">{ret.customer_name}</td>
                      <td className="px-6 py-3 text-xs text-slate-500">{ret.reason}</td>
                      <td className="px-6 py-3 text-right font-semibold text-emerald-600">
                        {formatMinorUnits(ret.refund_amount_minor, currency)}
                      </td>
                    </tr>
                  ))}
                  {overview.pending_returns.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-400 text-xs">
                        No pending return items in queue.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Inventory Valuation */}
          {reportType === "inventory" && (
            <div className="space-y-6">
              <div className="bg-teal-50 dark:bg-teal-950/40 p-5 rounded-xl border border-teal-200 dark:border-teal-800">
                <div className="text-xs font-semibold text-teal-800 dark:text-teal-200 uppercase">
                  Low Stock Depletion Alert
                </div>
                <div className="text-xl font-bold text-teal-900 dark:text-teal-100 mt-1">
                  {overview.kpis.low_stock_products} catalog items below reorder point
                </div>
                <p className="text-xs text-teal-700 dark:text-teal-300 mt-1">
                  Export the full CSV above to view complete SKU-level unit valuation and on-hand stock counts.
                </p>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-800 dark:text-slate-100">
                  Critical Stock Reorder Queue
                </div>
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs text-slate-500 uppercase">
                    <tr>
                      <th className="px-6 py-3">Product Name</th>
                      <th className="px-6 py-3">SKU</th>
                      <th className="px-6 py-3 text-right">Available Stock</th>
                      <th className="px-6 py-3 text-right">Reorder Threshold</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {overview.low_stock_alerts.map((item) => (
                      <tr key={item.id}>
                        <td className="px-6 py-3 font-medium text-slate-800 dark:text-slate-200">{item.name}</td>
                        <td className="px-6 py-3 font-mono text-xs text-slate-500">{item.sku}</td>
                        <td className="px-6 py-3 text-right font-bold text-amber-600">
                          {item.available_stock} {item.uom}
                        </td>
                        <td className="px-6 py-3 text-right text-xs text-slate-400">
                          {item.low_stock_threshold} {item.uom}
                        </td>
                      </tr>
                    ))}
                    {overview.low_stock_alerts.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-slate-400 text-xs">
                          All tracked catalog items are safely above low-stock thresholds.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

