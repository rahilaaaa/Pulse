import { useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../shared/api/client";
import { EmptyState, LoadingState } from "../../shared/ui/States";
import { CommerceNavigation } from "../commerce/CommerceNavigation";
import type { CommerceNavTab, CommerceOverviewData } from "../commerce/types";
import { OverviewView } from "../commerce/views/OverviewView";
import { ProductsView } from "../commerce/views/ProductsView";
import { CategoriesView } from "../commerce/views/CategoriesView";
import { PriceListsView } from "../commerce/views/PriceListsView";
import { InventoryView } from "../commerce/views/InventoryView";
import { OrdersView } from "../commerce/views/OrdersView";
import { CustomersView } from "../commerce/views/CustomersView";
import { VendorsView } from "../commerce/views/VendorsView";
import { DiscountsView } from "../commerce/views/DiscountsView";
import { ReturnsView } from "../commerce/views/ReturnsView";
import { ReportsView } from "../commerce/views/ReportsView";
import { SettingsView } from "../commerce/views/SettingsView";
import type { WorkspacePayload } from "./types";

export function CommercePage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const permissions = workspace.permissions || [];

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as CommerceNavTab) || "overview";
  const [dateFilter, setDateFilter] = useState<string>("30d");

  // Query overview dashboard for KPI counts and live navigation badges
  const overviewQuery = useQuery({
    queryKey: ["commerce-overview", companyId, dateFilter],
    queryFn: () =>
      api<CommerceOverviewData>(`/api/v1/companies/${companyId}/commerce/overview/?period=${dateFilter}`),
    retry: 1,
  });

  const handleSelectTab = (tab: CommerceNavTab) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", tab);
    nextParams.delete("action");
    nextParams.delete("productId");
    setSearchParams(nextParams);
  };

  const handleNavigateTab = (tab: CommerceNavTab, extraParams?: Record<string, string>) => {
    const nextParams = new URLSearchParams();
    nextParams.set("tab", tab);
    if (extraParams) {
      Object.entries(extraParams).forEach(([k, v]) => nextParams.set(k, v));
    }
    setSearchParams(nextParams);
  };

  if (overviewQuery.isLoading) {
    return <LoadingState label="Loading Commerce Operations Workspace..." />;
  }

  if (overviewQuery.isError) {
    return (
      <div className="py-12">
        <EmptyState
          title="Commerce Module Not Active"
          body="The Commerce module is not enabled for this company or you do not have permission to access it. Visit the Marketplace to install or verify your organization permissions."
        />
      </div>
    );
  }

  const overviewData = overviewQuery.data!;
  const currencySymbol = overviewData?.kpis?.currency_symbol || "₹";

  const badges = {
    pending_orders: overviewData?.kpis?.pending_orders || 0,
    low_stock: overviewData?.kpis?.low_stock_products || 0,
    pending_returns: overviewData?.pending_returns?.length || 0,
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner / Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
              Enterprise Operations
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Commerce Operations
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Full-lifecycle sales desk, multi-tier pricing, Parties integration, inventory alerts, and returns ledger.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            Company: <strong className="text-slate-900 dark:text-white">{workspace.company.display_name}</strong>
          </span>
          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
            {overviewData?.kpis?.currency || "INR"} ({currencySymbol})
          </span>
        </div>
      </div>

      {/* 12-item Commerce Navigation Bar */}
      <CommerceNavigation
        activeTab={activeTab}
        onTabChange={handleSelectTab}
        badges={badges}
        permissions={permissions}
      />

      {/* Tab View Content */}
      <div className="transition-all">
        {activeTab === "overview" && (
          <OverviewView
            data={overviewData}
            currency={overviewData.kpis.currency}
            currencySymbol={currencySymbol}
            onNavigateTab={handleNavigateTab}
            onDateFilterChange={setDateFilter}
            dateFilter={dateFilter}
            permissions={permissions}
          />
        )}

        {activeTab === "products" && (
          <ProductsView
            companyId={companyId}
            currencySymbol={currencySymbol}
            permissions={permissions}
            initialCreateOpen={searchParams.get("action") === "create"}
          />
        )}

        {activeTab === "categories" && (
          <CategoriesView companyId={companyId} permissions={permissions} />
        )}

        {activeTab === "price_lists" && (
          <PriceListsView
            companyId={companyId}
            currencySymbol={currencySymbol}
            permissions={permissions}
          />
        )}

        {activeTab === "inventory" && (
          <InventoryView
            companyId={companyId}
            currencySymbol={currencySymbol}
            permissions={permissions}
            initialAdjustOpen={searchParams.get("action") === "adjust"}
            initialProductId={searchParams.get("productId") || undefined}
          />
        )}

        {activeTab === "orders" && (
          <OrdersView
            companyId={companyId}
            currencySymbol={currencySymbol}
            permissions={permissions}
            initialCreateOpen={searchParams.get("action") === "create"}
          />
        )}

        {activeTab === "customers" && (
          <CustomersView
            companyId={companyId}
            currencySymbol={currencySymbol}
            permissions={permissions}
            onNavigateTab={handleNavigateTab}
            initialCreateOpen={searchParams.get("action") === "create"}
          />
        )}

        {activeTab === "vendors" && (
          <VendorsView
            companyId={companyId}
            currencySymbol={currencySymbol}
            permissions={permissions}
          />
        )}

        {activeTab === "discounts" && <DiscountsView companyId={companyId} />}

        {activeTab === "returns" && <ReturnsView companyId={companyId} />}

        {activeTab === "reports" && <ReportsView companyId={companyId} />}

        {activeTab === "settings" && <SettingsView companyId={companyId} />}
      </div>
    </div>
  );
}
