import { useState, useEffect } from "react";
import { ReturnItem, RefundStatus } from "../types";
import { formatMinorUnits, getStatusBadgeClass } from "../utils";

interface ReturnsViewProps {
  companyId: string;
}

export function ReturnsView({ companyId }: ReturnsViewProps) {
  const [returns, setReturns] = useState<ReturnItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Process / Action Modal State
  const [selectedReturn, setSelectedReturn] = useState<ReturnItem | null>(null);
  const [actionType, setActionType] = useState<"approve" | "receive" | "complete" | "reject">("approve");
  const [actionNotes, setActionNotes] = useState("");
  const [restockInventory, setRestockInventory] = useState(true);
  const [refundStatus, setRefundStatus] = useState<RefundStatus>("pending");
  const [processing, setProcessing] = useState(false);

  // Create Return Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [refundAmount, setRefundAmount] = useState("0");
  const [creating, setCreating] = useState(false);

  const fetchReturns = async () => {
    try {
      setLoading(true);
      setError(null);
      let url = `/api/v1/companies/${companyId}/commerce/returns/`;
      if (statusFilter !== "all") {
        url += `?status=${statusFilter}`;
      }
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load returns");
      const data = await res.json();
      setReturns(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error fetching returns");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
  }, [companyId, statusFilter]);

  const handleActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReturn) return;

    try {
      setProcessing(true);
      const payload: Record<string, unknown> = {
        action: actionType,
        notes: actionNotes,
      };

      if (actionType === "complete") {
        payload.restock_inventory = restockInventory;
        payload.refund_status = refundStatus;
      }

      const res = await fetch(
        `/api/v1/companies/${companyId}/commerce/returns/${selectedReturn.id}/action/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to update return request");
      }

      setSelectedReturn(null);
      setActionNotes("");
      fetchReturns();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error processing action");
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId.trim() || !reason.trim()) {
      alert("Please provide the Order ID / Number and reason for the return.");
      return;
    }

    try {
      setCreating(true);
      const refundMinor = Math.round((parseFloat(refundAmount) || 0) * 100);
      const payload = {
        order_id: orderId.trim(),
        reason: reason.trim(),
        notes: notes.trim(),
        lines: [
          {
            product_id: null,
            quantity: 1,
            refund_amount_minor: refundMinor,
            reason: reason.trim(),
          },
        ],
      };

      const res = await fetch(`/api/v1/companies/${companyId}/commerce/returns/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to create return request");
      }

      setShowCreateModal(false);
      setOrderId("");
      setReason("");
      setNotes("");
      setRefundAmount("0");
      fetchReturns();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error creating return");
    } finally {
      setCreating(false);
    }
  };

  const openActionModal = (ret: ReturnItem, type: "approve" | "receive" | "complete" | "reject") => {
    setSelectedReturn(ret);
    setActionType(type);
    setActionNotes("");
    setRestockInventory(true);
    setRefundStatus(ret.refund_status || "pending");
  };

  const filteredReturns = returns.filter(
    (r) =>
      r.return_number.toLowerCase().includes(search.toLowerCase()) ||
      r.order_number.toLowerCase().includes(search.toLowerCase()) ||
      r.customer_name.toLowerCase().includes(search.toLowerCase())
  );

  const pendingCount = returns.filter((r) => r.status === "requested").length;
  const approvedCount = returns.filter((r) => r.status === "approved" || r.status === "received").length;
  const totalRefunded = returns
    .filter((r) => r.refund_status === "refunded")
    .reduce((sum, r) => sum + r.refund_amount_minor, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Returns & Refunds</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Handle customer return requests, inspection, restock workflows, and separate refund states.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg shadow-sm text-white bg-teal-600 hover:bg-teal-700"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Record Return Request
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="text-xs font-semibold text-slate-400 uppercase">Total Requests</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{returns.length}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="text-xs font-semibold text-amber-500 uppercase">Pending Approval</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{pendingCount}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="text-xs font-semibold text-blue-500 uppercase">In Inspection</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{approvedCount}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="text-xs font-semibold text-emerald-500 uppercase">Total Refunded</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">
            {formatMinorUnits(totalRefunded, "INR")}
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-2">
          {(["all", "requested", "approved", "received", "completed", "rejected"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors ${
                statusFilter === st
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
        <div className="relative min-w-[240px]">
          <input
            type="text"
            placeholder="Search return #, order #, or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <svg
            className="w-4 h-4 text-slate-400 absolute left-3 top-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="p-12 text-center text-slate-400">Loading returns...</div>
      ) : error ? (
        <div className="p-6 bg-red-50 text-red-700 rounded-lg">{error}</div>
      ) : filteredReturns.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
          <p className="text-slate-500 dark:text-slate-400">No returns found matching the current criteria.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3">Return ID</th>
                <th className="px-6 py-3">Original Order</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Reason / Details</th>
                <th className="px-6 py-3">Refund Amount</th>
                <th className="px-6 py-3">Return Status</th>
                <th className="px-6 py-3">Refund Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredReturns.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-6 py-4 font-mono font-medium text-slate-900 dark:text-white">
                    {item.return_number}
                    <div className="text-xs text-slate-400 font-sans mt-0.5">
                      {new Date(item.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-teal-600 dark:text-teal-400">
                    {item.order_number}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">
                    {item.customer_name}
                  </td>
                  <td className="px-6 py-4 max-w-xs truncate text-xs text-slate-600 dark:text-slate-300">
                    <div className="font-medium text-slate-700 dark:text-slate-300">{item.reason}</div>
                    {item.notes && <div className="text-slate-400 truncate mt-0.5">{item.notes}</div>}
                  </td>
                  <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">
                    {formatMinorUnits(item.refund_amount_minor, "INR")}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusBadgeClass(
                        item.status
                      )}`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
                        item.refund_status === "refunded"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400"
                          : item.refund_status === "rejected"
                          ? "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-400"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400"
                      }`}
                    >
                      {item.refund_status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-1 whitespace-nowrap">
                    {item.status === "requested" && (
                      <>
                        <button
                          onClick={() => openActionModal(item, "approve")}
                          className="px-2.5 py-1 text-xs font-medium text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950 rounded"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => openActionModal(item, "reject")}
                          className="px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {item.status === "approved" && (
                      <button
                        onClick={() => openActionModal(item, "receive")}
                        className="px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded"
                      >
                        Receive Goods
                      </button>
                    )}
                    {item.status === "received" && (
                      <button
                        onClick={() => openActionModal(item, "complete")}
                        className="px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded font-semibold"
                      >
                        Complete & Restock
                      </button>
                    )}
                    {item.status === "completed" && (
                      <span className="text-xs text-slate-400">Finalized</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Action Modal */}
      {selectedReturn && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white capitalize mb-2">
              {actionType} Return: {selectedReturn.return_number}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Original Order: <strong>{selectedReturn.order_number}</strong> | Customer:{" "}
              <strong>{selectedReturn.customer_name}</strong>
            </p>

            <form onSubmit={handleActionSubmit} className="space-y-4 text-sm">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Action Notes
                </label>
                <textarea
                  rows={2}
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder="Notes for timeline / audit..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>

              {actionType === "complete" && (
                <>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="restockCheckbox"
                      checked={restockInventory}
                      onChange={(e) => setRestockInventory(e.target.checked)}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <label htmlFor="restockCheckbox" className="font-medium text-slate-800 dark:text-slate-200">
                      Restock returned items into inventory automatically
                    </label>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Update Payment Refund Status
                    </label>
                    <select
                      value={refundStatus}
                      onChange={(e) => setRefundStatus(e.target.value as RefundStatus)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                    >
                      <option value="pending">Pending Gateway Processing</option>
                      <option value="refunded">Marked as Refunded</option>
                      <option value="rejected">Refund Rejected</option>
                    </select>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setSelectedReturn(null)}
                  className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg capitalize disabled:opacity-50"
                >
                  {processing ? "Updating..." : `Confirm ${actionType}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Return Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-lg w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Record New Return</h3>
            <form onSubmit={handleCreateReturn} className="space-y-4 text-sm">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Order ID or Order Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ORD-2026-0001 or UUID"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Reason for Return *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Defective unit, Incorrect size, Customer mind change"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Estimated Refund Amount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Internal Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional context or inspection details..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-50"
                >
                  {creating ? "Submitting..." : "Submit Return"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
