import { useState, useEffect } from "react";
import { CommerceSettingsData } from "../types";

interface SettingsViewProps {
  companyId: string;
}

export function SettingsView({ companyId }: SettingsViewProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Form states
  const [currency, setCurrency] = useState("INR");
  const [currencySymbol, setCurrencySymbol] = useState("₹");
  const [taxRate, setTaxRate] = useState("18.00");
  const [taxIncluded, setTaxIncluded] = useState(false);
  const [orderPrefix, setOrderPrefix] = useState("ORD-");
  const [returnPrefix, setReturnPrefix] = useState("RET-");
  const [lowStockThreshold, setLowStockThreshold] = useState("10");
  const [autoDeductInventory, setAutoDeductInventory] = useState(true);
  const [allowBackorders, setAllowBackorders] = useState(false);
  const [returnWindowDays, setReturnWindowDays] = useState("30");
  const [enableCustomerNotes, setEnableCustomerNotes] = useState(true);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/companies/${companyId}/commerce/settings/`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load commerce configuration");
      const data: CommerceSettingsData = await res.json();
      setCurrency(data.currency);
      setCurrencySymbol(data.currency_symbol);
      setTaxRate(data.tax_rate);
      setTaxIncluded(data.tax_included_in_price);
      setOrderPrefix(data.order_number_prefix);
      setReturnPrefix(data.return_number_prefix);
      setLowStockThreshold(data.default_low_stock_threshold.toString());
      setAutoDeductInventory(data.auto_deduct_inventory);
      setAllowBackorders(data.allow_backorders);
      setReturnWindowDays(data.return_window_days.toString());
      setEnableCustomerNotes(data.enable_customer_notes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error fetching settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [companyId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setSavedSuccess(false);

      const payload = {
        currency: currency.toUpperCase(),
        currency_symbol: currencySymbol,
        tax_rate: parseFloat(taxRate) || 0,
        tax_included_in_price: taxIncluded,
        order_number_prefix: orderPrefix,
        return_number_prefix: returnPrefix,
        default_low_stock_threshold: parseInt(lowStockThreshold, 10) || 0,
        auto_deduct_inventory: autoDeductInventory,
        allow_backorders: allowBackorders,
        return_window_days: parseInt(returnWindowDays, 10) || 30,
        enable_customer_notes: enableCustomerNotes,
      };

      const res = await fetch(`/api/v1/companies/${companyId}/commerce/settings/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to update commerce settings");
      }

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
      fetchSettings();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error saving settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Commerce Configuration & Policies</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Manage currency, statutory tax computation, automated stock reservation, and sequence numbering.
        </p>
      </div>

      {savedSuccess && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl text-sm flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Commerce settings saved and active across your company.
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-400">Loading module configuration...</div>
      ) : error ? (
        <div className="p-6 bg-red-50 text-red-700 rounded-lg">{error}</div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Section 1: Financial & Currency */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-xs border border-slate-200 dark:border-slate-700 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2">
              Currency & Statutory Taxes
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Default Currency (ISO code)
                </label>
                <input
                  type="text"
                  maxLength={3}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white uppercase font-mono"
                />
                <p className="text-xs text-slate-400 mt-1">Default company currency code e.g. INR, USD, EUR.</p>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Currency Symbol
                </label>
                <input
                  type="text"
                  value={currencySymbol}
                  onChange={(e) => setCurrencySymbol(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Default Statutory Tax Rate (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white font-mono"
                />
                <p className="text-xs text-slate-400 mt-1">Default percentage applied if product has no specific tax.</p>
              </div>

              <div className="flex items-center gap-3 pt-6">
                <input
                  type="checkbox"
                  id="taxIncludedCheck"
                  checked={taxIncluded}
                  onChange={(e) => setTaxIncluded(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                />
                <label htmlFor="taxIncludedCheck" className="text-sm text-slate-700 dark:text-slate-300">
                  Unit selling prices already include taxes (Gross Pricing)
                </label>
              </div>
            </div>
          </div>

          {/* Section 2: Order & Sequence Numbering */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-xs border border-slate-200 dark:border-slate-700 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2">
              Document Numbering & Sequences
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Order Number Prefix
                </label>
                <input
                  type="text"
                  value={orderPrefix}
                  onChange={(e) => setOrderPrefix(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white font-mono"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Example resulting number: <strong>{orderPrefix}2026-0001</strong>
                </p>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Return Number Prefix
                </label>
                <input
                  type="text"
                  value={returnPrefix}
                  onChange={(e) => setReturnPrefix(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white font-mono"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Example resulting number: <strong>{returnPrefix}2026-0001</strong>
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Inventory Integration & Stock Policies */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-xs border border-slate-200 dark:border-slate-700 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2">
              Inventory & Fulfillment Policies
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Default Low Stock Alert Threshold
                </label>
                <input
                  type="number"
                  min="0"
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Products with available stock below this value trigger low stock dashboard alerts.
                </p>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Customer Return Window (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  value={returnWindowDays}
                  onChange={(e) => setReturnWindowDays(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Number of days after delivery where return requests are permitted.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2 text-sm">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="autoDeductCheck"
                  checked={autoDeductInventory}
                  onChange={(e) => setAutoDeductInventory(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                />
                <label htmlFor="autoDeductCheck" className="text-slate-700 dark:text-slate-300">
                  <strong>Atomic stock reservation:</strong> Automatically reserve inventory upon order creation and deduct upon order confirmation.
                </label>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="backordersCheck"
                  checked={allowBackorders}
                  onChange={(e) => setAllowBackorders(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                />
                <label htmlFor="backordersCheck" className="text-slate-700 dark:text-slate-300">
                  Allow backorders (customers can place orders even when available stock is zero)
                </label>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="custNotesCheck"
                  checked={enableCustomerNotes}
                  onChange={(e) => setEnableCustomerNotes(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                />
                <label htmlFor="custNotesCheck" className="text-slate-700 dark:text-slate-300">
                  Allow internal customer notes and delivery instructions on orders
                </label>
              </div>
            </div>
          </div>

          {/* Submit bar */}
          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving Changes..." : "Save Commerce Configuration"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
