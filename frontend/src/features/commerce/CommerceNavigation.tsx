import type { CommerceNavTab } from "./types";

interface CommerceNavigationProps {
  activeTab: CommerceNavTab;
  onTabChange: (tab: CommerceNavTab) => void;
  permissions: string[];
  badges?: {
    pending_orders?: number;
    low_stock?: number;
    pending_returns?: number;
  };
  roleBadgeText?: string;
}

export function CommerceNavigation({
  activeTab,
  onTabChange,
  permissions,
  badges = {},
  roleBadgeText = "Operations Staff",
}: CommerceNavigationProps) {
  const can = (code: string) => permissions.includes(code) || permissions.includes("commerce.manage");

  const tabs: Array<{ id: CommerceNavTab; label: string; badge?: number; visible: boolean }> = [
    { id: "overview", label: "Overview", visible: true },
    { id: "products", label: "Products", visible: can("commerce.view.products") || can("commerce.view") },
    { id: "categories", label: "Categories", visible: can("commerce.manage.categories") || can("commerce.view.products") || can("commerce.view") },
    { id: "price_lists", label: "Price Lists", visible: can("commerce.manage.pricing") || can("commerce.view") },
    { id: "inventory", label: "Inventory", badge: badges.low_stock, visible: can("commerce.view.products") || can("commerce.view") },
    { id: "orders", label: "Orders", badge: badges.pending_orders, visible: can("commerce.view.orders") || can("commerce.view") },
    { id: "customers", label: "Customers", visible: can("commerce.manage.customers") || can("parties.view") || can("commerce.view") },
    { id: "vendors", label: "Vendors", visible: can("commerce.manage.vendors") || can("parties.view") || can("commerce.view") },
    { id: "discounts", label: "Discounts & Offers", visible: can("commerce.manage.discounts") || can("commerce.view") },
    { id: "returns", label: "Returns & Refunds", badge: badges.pending_returns, visible: can("commerce.manage.returns") || can("commerce.view") },
    { id: "reports", label: "Reports", visible: can("commerce.view.reports") || can("commerce.view") },
    { id: "settings", label: "Settings", visible: can("commerce.manage.settings") || can("commerce.view") },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pulse-border pb-3">
      {/* 12-Item Commerce Navigation Pills */}
      <nav className="flex flex-wrap items-center gap-1.5" aria-label="Commerce Module Navigation">
        {tabs
          .filter((t) => t.visible)
          .map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? "bg-pulse-accent text-white shadow-sm"
                    : "bg-pulse-surface text-pulse-muted hover:bg-pulse-hover hover:text-pulse-ink"
                }`}
              >
                <span>{tab.label}</span>
                {typeof tab.badge === "number" && tab.badge > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      isActive
                        ? "bg-white text-pulse-accent"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
      </nav>

      {/* Role Context Indicator */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-pulse-muted">Commerce Access:</span>
        <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 border border-teal-200/50">
          {roleBadgeText}
        </span>
      </div>
    </div>
  );
}

