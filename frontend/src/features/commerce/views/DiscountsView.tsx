import { useState, useEffect } from "react";
import { DiscountItem } from "../types";
import { formatMinorUnits } from "../utils";

interface DiscountsViewProps {
  companyId: string;
}

export function DiscountsView({ companyId }: DiscountsViewProps) {
  const [discounts, setDiscounts] = useState<DiscountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed_amount">("percentage");
  const [value, setValue] = useState("10.00");
  const [minOrderAmount, setMinOrderAmount] = useState("0");
  const [maxDiscountAmount, setMaxDiscountAmount] = useState("");
  const [appliesTo, setAppliesTo] = useState("all");
  const [usageLimit, setUsageLimit] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [isActive, setIsActive] = useState(true);

  const fetchDiscounts = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/companies/${companyId}/commerce/discounts/`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load discounts");
      const data = await res.json();
      setDiscounts(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error fetching discounts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiscounts();
  }, [companyId]);

  const handleCreateDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim() || !value) {
      alert("Please provide discount name, coupon code, and discount value.");
      return;
    }

    try {
      setSaving(true);
      const minOrderMinor = Math.round((parseFloat(minOrderAmount) || 0) * 100);
      const maxDiscountMinor = maxDiscountAmount ? Math.round(parseFloat(maxDiscountAmount) * 100) : null;
      const payload = {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        discount_type: discountType,
        value: parseFloat(value).toFixed(2),
        min_order_amount_minor: minOrderMinor,
        max_discount_amount_minor: maxDiscountMinor,
        applies_to: appliesTo,
        usage_limit: usageLimit ? parseInt(usageLimit, 10) : null,
        starts_at: startsAt || null,
        expires_at: expiresAt || null,
        is_active: isActive,
      };

      const res = await fetch(`/api/v1/companies/${companyId}/commerce/discounts/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to create discount");
      }

      setShowCreateModal(false);
      resetForm();
      fetchDiscounts();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error creating discount");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (discount: DiscountItem) => {
    try {
      const res = await fetch(`/api/v1/companies/${companyId}/commerce/discounts/${discount.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_active: !discount.is_active }),
      });
      if (!res.ok) throw new Error("Failed to update discount status");
      fetchDiscounts();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error toggling status");
    }
  };

  const handleDelete = async (id: string, code: string) => {
    if (!confirm(`Are you sure you want to delete coupon code "${code}"?`)) return;
    try {
      const res = await fetch(`/api/v1/companies/${companyId}/commerce/discounts/${id}/`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete discount");
      fetchDiscounts();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error deleting discount");
    }
  };

  const resetForm = () => {
    setName("");
    setCode("");
    setDiscountType("percentage");
    setValue("10.00");
    setMinOrderAmount("0");
    setMaxDiscountAmount("");
    setAppliesTo("all");
    setUsageLimit("");
    setStartsAt("");
    setExpiresAt("");
    setIsActive(true);
  };

  const filteredDiscounts = discounts.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Discounts & Offers</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Configure promotional coupon codes, percentage discounts, and order thresholds.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg shadow-sm text-white bg-teal-600 hover:bg-teal-700"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Discount
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 flex flex-wrap gap-4 items-center justify-between">
        <div className="relative flex-1 min-w-[240px]">
          <input
            type="text"
            placeholder="Search coupon by code or campaign name..."
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
        <div className="text-sm text-slate-500">
          Showing <strong>{filteredDiscounts.length}</strong> discounts
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="p-12 text-center text-slate-400">Loading promotional discounts...</div>
      ) : error ? (
        <div className="p-6 bg-red-50 text-red-700 rounded-lg">{error}</div>
      ) : filteredDiscounts.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
          <p className="text-slate-500 dark:text-slate-400">No discounts or coupons found.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-3 px-3.5 py-1.5 text-xs font-medium text-teal-600 border border-teal-600 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-950"
          >
            Create Your First Promotion
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3">Code / Name</th>
                <th className="px-6 py-3">Type & Value</th>
                <th className="px-6 py-3">Conditions</th>
                <th className="px-6 py-3">Usage</th>
                <th className="px-6 py-3">Validity</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredDiscounts.map((discount) => (
                <tr key={discount.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-6 py-4">
                    <span className="inline-block px-2.5 py-1 rounded bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-mono text-xs font-bold border border-teal-200 dark:border-teal-800">
                      {discount.code}
                    </span>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{discount.name}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {discount.discount_type === "percentage"
                        ? `${discount.value}% OFF`
                        : `Fixed ${formatMinorUnits(Math.round(parseFloat(discount.value) * 100), "INR")}`}
                    </span>
                    <div className="text-xs text-slate-400 capitalize">Scope: {discount.applies_to}</div>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-300">
                    <div>Min: {formatMinorUnits(discount.min_order_amount_minor, "INR")}</div>
                    {discount.max_discount_amount_minor && (
                      <div className="text-slate-400">
                        Cap: {formatMinorUnits(discount.max_discount_amount_minor, "INR")}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">{discount.usage_count}</span>
                    {discount.usage_limit ? ` / ${discount.usage_limit}` : " used (Unlimited)"}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">
                    {discount.expires_at ? (
                      <span>Expires {new Date(discount.expires_at).toLocaleDateString()}</span>
                    ) : (
                      <span className="text-emerald-600">No expiration</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggleActive(discount)}
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        discount.is_active
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"
                      }`}
                    >
                      {discount.is_active ? "Active" : "Disabled"}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => handleDelete(discount.id, discount.code)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-lg w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Create New Promotion</h3>
            <form onSubmit={handleCreateDiscount} className="space-y-4 text-sm">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Campaign / Discount Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Diwali Fest 15% Off"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Coupon Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. DIWALI15"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Type</label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed_amount")}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed_amount">Fixed Amount (₹)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {discountType === "percentage" ? "Percentage Value (%) *" : "Fixed Discount Amount (₹) *"}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Min Order Value (₹)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="0"
                    value={minOrderAmount}
                    onChange={(e) => setMinOrderAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  />
                </div>
              </div>

              {discountType === "percentage" && (
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Maximum Discount Cap (₹ optional)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="e.g. 500"
                    value={maxDiscountAmount}
                    onChange={(e) => setMaxDiscountAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Usage Limit (optional)
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Unlimited"
                    value={usageLimit}
                    onChange={(e) => setUsageLimit(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Applies To
                  </label>
                  <select
                    value={appliesTo}
                    onChange={(e) => setAppliesTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  >
                    <option value="all">Entire Order</option>
                    <option value="category">Category Specific</option>
                    <option value="product">Specific Products</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Start Date (optional)
                  </label>
                  <input
                    type="date"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white text-xs"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Expiry Date (optional)
                  </label>
                  <input
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActiveToggle"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <label htmlFor="isActiveToggle" className="text-sm text-slate-700 dark:text-slate-300">
                  Activate this discount immediately
                </label>
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
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Create Promotion"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

