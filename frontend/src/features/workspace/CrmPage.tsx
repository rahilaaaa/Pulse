import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { Modal } from "../../shared/ui/Modal";
import { initials } from "./format";
import type { WorkspacePayload } from "./types";

// Types matching backend models and API contracts
export type LeadRow = {
  id: string;
  title: string;
  status: "new" | "qualified" | "converted" | "lost" | string;
  email: string;
  party_id: string | null;
  created_at?: string;
};

export type AccountRow = {
  id: string;
  name: string;
  party_id: string;
  party: string;
};

export type PartyLookupRow = {
  id: string;
  kind: string;
  display_name: string;
  email: string;
  phone: string;
  status: string;
};

type CrmTab = "overview" | "leads" | "accounts" | "opportunities" | "activities";
type LeadSortField = "title" | "email" | "status";
type AccountSortField = "name" | "party";
type SortOrder = "asc" | "desc";

export function CrmPage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const canView = workspace.permissions.includes("crm.view");
  const canManage = workspace.permissions.includes("crm.manage");
  const queryClient = useQueryClient();

  // URL Tab management
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = (searchParams.get("tab") as CrmTab) || "overview";

  function setTab(tab: CrmTab) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
  }

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3800);
  }

  // Filter & Search states - Leads
  const [leadSearch, setLeadSearch] = useState("");
  const [leadStatusFilter, setLeadStatusFilter] = useState<string>("all");
  const [leadSortField, setLeadSortField] = useState<LeadSortField>("title");
  const [leadSortOrder, setLeadSortOrder] = useState<SortOrder>("asc");
  const [leadPage, setLeadPage] = useState<number>(1);
  const [leadPageSize, setLeadPageSize] = useState<number>(10);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());

  // Filter & Search states - Accounts
  const [accountSearch, setAccountSearch] = useState("");
  const [accountSortField, setAccountSortField] = useState<AccountSortField>("name");
  const [accountSortOrder, setAccountSortOrder] = useState<SortOrder>("asc");
  const [accountPage, setAccountPage] = useState<number>(1);
  const [accountPageSize, setAccountPageSize] = useState<number>(10);

  // Modals state
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [convertingLead, setConvertingLead] = useState<LeadRow | null>(null);
  const [viewingLead, setViewingLead] = useState<LeadRow | null>(null);
  const [viewingAccount, setViewingAccount] = useState<AccountRow | null>(null);

  // Add Lead Form state
  const [addTitle, setAddTitle] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addError, setAddError] = useState("");

  // 1. Fetch Leads Query
  const leadsQuery = useQuery({
    queryKey: ["crm-leads", companyId],
    queryFn: () => api<{ results: LeadRow[] }>(`/api/v1/companies/${companyId}/crm/leads/`),
    enabled: canView,
  });

  // 2. Fetch Accounts Query
  const accountsQuery = useQuery({
    queryKey: ["crm-accounts", companyId],
    queryFn: () => api<{ results: AccountRow[] }>(`/api/v1/companies/${companyId}/crm/accounts/`),
    enabled: canView,
  });

  // 3. Fetch Parties Query (for linked contact context)
  const partiesQuery = useQuery({
    queryKey: ["parties", companyId],
    queryFn: () => api<{ results: PartyLookupRow[] }>(`/api/v1/companies/${companyId}/parties/`),
    enabled: canView && workspace.permissions.includes("parties.view"),
  });

  const allLeads = leadsQuery.data?.results ?? [];
  const allAccounts = accountsQuery.data?.results ?? [];
  const allParties = partiesQuery.data?.results ?? [];

  // Map of party ID to party details for fast lookup
  const partiesById = useMemo(() => {
    const map = new Map<string, PartyLookupRow>();
    allParties.forEach((p) => map.set(p.id, p));
    return map;
  }, [allParties]);

  // Metric Computations from real backend records
  const totalLeadsCount = allLeads.length;
  const newLeadsCount = allLeads.filter((l) => l.status.toLowerCase() === "new").length;
  const qualifiedLeadsCount = allLeads.filter((l) => l.status.toLowerCase() === "qualified").length;
  const convertedLeadsCount = allLeads.filter((l) => l.status.toLowerCase() === "converted").length;
  const lostLeadsCount = allLeads.filter((l) => l.status.toLowerCase() === "lost").length;
  const activeLeadsCount = newLeadsCount + qualifiedLeadsCount;
  const totalAccountsCount = allAccounts.length;

  const conversionRate = totalLeadsCount > 0
    ? Math.round((convertedLeadsCount / totalLeadsCount) * 100)
    : 0;

  // Leads Filtering & Sorting
  const filteredLeads = useMemo(() => {
    return allLeads.filter((lead) => {
      if (leadStatusFilter !== "all" && lead.status.toLowerCase() !== leadStatusFilter.toLowerCase()) {
        return false;
      }
      if (leadSearch.trim()) {
        const query = leadSearch.toLowerCase().trim();
        const matchTitle = (lead.title || "").toLowerCase().includes(query);
        const matchEmail = (lead.email || "").toLowerCase().includes(query);
        const matchId = (lead.id || "").toLowerCase().includes(query);
        if (!matchTitle && !matchEmail && !matchId) {
          return false;
        }
      }
      return true;
    });
  }, [allLeads, leadStatusFilter, leadSearch]);

  const sortedLeads = useMemo(() => {
    const list = [...filteredLeads];
    list.sort((a, b) => {
      let valA = (a[leadSortField] || "").toLowerCase();
      let valB = (b[leadSortField] || "").toLowerCase();
      if (valA < valB) return leadSortOrder === "asc" ? -1 : 1;
      if (valA > valB) return leadSortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredLeads, leadSortField, leadSortOrder]);

  const totalLeadPages = Math.ceil(sortedLeads.length / leadPageSize) || 1;
  const paginatedLeads = useMemo(() => {
    const start = (leadPage - 1) * leadPageSize;
    return sortedLeads.slice(start, start + leadPageSize);
  }, [sortedLeads, leadPage, leadPageSize]);

  function handleLeadSort(field: LeadSortField) {
    if (leadSortField === field) {
      setLeadSortOrder(leadSortOrder === "asc" ? "desc" : "asc");
    } else {
      setLeadSortField(field);
      setLeadSortOrder("asc");
    }
  }

  // Accounts Filtering & Sorting
  const filteredAccounts = useMemo(() => {
    return allAccounts.filter((account) => {
      if (accountSearch.trim()) {
        const query = accountSearch.toLowerCase().trim();
        const matchName = (account.name || "").toLowerCase().includes(query);
        const matchParty = (account.party || "").toLowerCase().includes(query);
        const matchId = (account.id || "").toLowerCase().includes(query);
        if (!matchName && !matchParty && !matchId) {
          return false;
        }
      }
      return true;
    });
  }, [allAccounts, accountSearch]);

  const sortedAccounts = useMemo(() => {
    const list = [...filteredAccounts];
    list.sort((a, b) => {
      let valA = (a[accountSortField] || "").toLowerCase();
      let valB = (b[accountSortField] || "").toLowerCase();
      if (valA < valB) return accountSortOrder === "asc" ? -1 : 1;
      if (valA > valB) return accountSortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredAccounts, accountSortField, accountSortOrder]);

  const totalAccountPages = Math.ceil(sortedAccounts.length / accountPageSize) || 1;
  const paginatedAccounts = useMemo(() => {
    const start = (accountPage - 1) * accountPageSize;
    return sortedAccounts.slice(start, start + accountPageSize);
  }, [sortedAccounts, accountPage, accountPageSize]);

  function handleAccountSort(field: AccountSortField) {
    if (accountSortField === field) {
      setAccountSortOrder(accountSortOrder === "asc" ? "desc" : "asc");
    } else {
      setAccountSortField(field);
      setAccountSortOrder("asc");
    }
  }

  // Lead Multi-Selection Logic
  const isAllLeadsSelected =
    paginatedLeads.length > 0 && paginatedLeads.every((l) => selectedLeadIds.has(l.id));
  const isSomeLeadsSelected =
    paginatedLeads.some((l) => selectedLeadIds.has(l.id)) && !isAllLeadsSelected;

  function toggleSelectAllLeads() {
    const next = new Set(selectedLeadIds);
    if (isAllLeadsSelected) {
      paginatedLeads.forEach((l) => next.delete(l.id));
    } else {
      paginatedLeads.forEach((l) => next.add(l.id));
    }
    setSelectedLeadIds(next);
  }

  function toggleSelectLead(id: string) {
    const next = new Set(selectedLeadIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedLeadIds(next);
  }

  // Export Leads to CSV
  function handleExportLeadsCsv() {
    const exportData =
      selectedLeadIds.size > 0
        ? allLeads.filter((l) => selectedLeadIds.has(l.id))
        : sortedLeads;

    if (exportData.length === 0) return;

    const headers = ["Title", "Email", "Status", "Party ID", "Lead ID"];
    const rows = exportData.map((l) => [
      `"${l.title.replace(/"/g, '""')}"`,
      l.email,
      l.status,
      l.party_id || "",
      l.id,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `pulse-crm-leads-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${exportData.length} leads to CSV.`);
  }

  // Export Accounts to CSV
  function handleExportAccountsCsv() {
    if (sortedAccounts.length === 0) return;

    const headers = ["Account Name", "Linked Party", "Party ID", "Account ID"];
    const rows = sortedAccounts.map((a) => [
      `"${a.name.replace(/"/g, '""')}"`,
      `"${a.party.replace(/"/g, '""')}"`,
      a.party_id,
      a.id,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `pulse-crm-accounts-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${sortedAccounts.length} accounts to CSV.`);
  }

  // 4. Create Lead Mutation
  const createLeadMutation = useMutation({
    mutationFn: (values: { title: string; email: string }) =>
      api<{ id: string; title: string; status: string }>(`/api/v1/companies/${companyId}/crm/leads/`, {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["crm-leads", companyId] });
      setIsAddLeadOpen(false);
      setAddTitle("");
      setAddEmail("");
      setAddError("");
      showToast(`Lead "${data.title}" registered successfully.`);
    },
    onError: (err) => {
      setAddError(err instanceof ApiError ? err.message : "Failed to create lead.");
    },
  });

  function handleCreateLeadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!addTitle.trim()) {
      setAddError("Please provide a lead title or company name.");
      return;
    }
    setAddError("");
    createLeadMutation.mutate({
      title: addTitle.trim(),
      email: addEmail.trim(),
    });
  }

  // 5. Convert Lead Mutation
  const convertLeadMutation = useMutation({
    mutationFn: (leadId: string) =>
      api<{ lead_id: string; party_id: string; account_id: string; opportunity_id: string }>(
        `/api/v1/companies/${companyId}/crm/leads/${leadId}/convert/`,
        { method: "POST", body: "{}" }
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm-leads", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["crm-accounts", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["parties", companyId] });
      setConvertingLead(null);
      showToast("Lead successfully converted into Account, Contact, and Opportunity!");
    },
    onError: (err) => {
      showToast(err instanceof ApiError ? err.message : "Failed to convert lead.");
    },
  });

  // Loading & Error States
  if (leadsQuery.isLoading || accountsQuery.isLoading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
          <div className="space-y-2">
            <div className="h-8 w-48 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
            <div className="h-4 w-80 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
          </div>
          <div className="h-10 w-32 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
        </div>
        {/* Metrics Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs animate-pulse" />
          ))}
        </div>
        {/* Table Skeleton */}
        <div className="h-96 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs animate-pulse" />
      </div>
    );
  }

  if (leadsQuery.isError || accountsQuery.isError) {
    return (
      <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-slate-100">CRM Module Unavailable</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          {leadsQuery.error instanceof ApiError
            ? leadsQuery.error.message
            : "Install the CRM module from the Modules catalog or verify your crm.view permission."}
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <Button variant="secondary" onClick={() => { leadsQuery.refetch(); accountsQuery.refetch(); }}>
            Retry Loading
          </Button>
          <Link to="/app/modules">
            <Button variant="ghost">Browse Modules Catalog</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-3 text-sm font-medium text-white dark:text-slate-900 shadow-xl border border-slate-700 animate-fade-in">
          <svg className="h-4 w-4 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">CRM Operations</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border border-teal-200/80 dark:border-teal-800/80">
              Active Module
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage your sales pipeline, track prospective leads, and nurture enterprise customer relationships.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {canManage && (
            <Button
              type="button"
              onClick={() => {
                setAddTitle("");
                setAddEmail("");
                setAddError("");
                setIsAddLeadOpen(true);
              }}
              className="flex items-center gap-1.5 shadow-xs"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Lead
            </Button>
          )}
        </div>
      </div>

      {/* 2. TAB NAVIGATION */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto" aria-label="CRM Sections">
          {/* Overview Tab */}
          <button
            type="button"
            onClick={() => setTab("overview")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition whitespace-nowrap ${
              currentTab === "overview"
                ? "border-teal-600 text-teal-700 dark:text-teal-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            Overview
          </button>

          {/* Leads Tab */}
          <button
            type="button"
            onClick={() => setTab("leads")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition whitespace-nowrap ${
              currentTab === "leads"
                ? "border-teal-600 text-teal-700 dark:text-teal-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
            Leads
            <span
              className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                currentTab === "leads"
                  ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              {totalLeadsCount}
            </span>
          </button>

          {/* Accounts Tab */}
          <button
            type="button"
            onClick={() => setTab("accounts")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition whitespace-nowrap ${
              currentTab === "accounts"
                ? "border-teal-600 text-teal-700 dark:text-teal-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 21h18" />
              <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
            </svg>
            Accounts
            <span
              className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                currentTab === "accounts"
                  ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              {totalAccountsCount}
            </span>
          </button>

          {/* Opportunities Tab */}
          <button
            type="button"
            onClick={() => setTab("opportunities")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition whitespace-nowrap ${
              currentTab === "opportunities"
                ? "border-teal-600 text-teal-700 dark:text-teal-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
            Opportunities
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60">
              Pipeline Schema
            </span>
          </button>

          {/* Activities Tab */}
          <button
            type="button"
            onClick={() => setTab("activities")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition whitespace-nowrap ${
              currentTab === "activities"
                ? "border-teal-600 text-teal-700 dark:text-teal-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Activities
          </button>
        </nav>
      </div>

      {/* 3. TAB CONTENT */}

      {/* ===================== TAB 1: OVERVIEW DASHBOARD ===================== */}
      {currentTab === "overview" && (
        <div className="space-y-6">
          {/* 4 Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Leads */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-shadow hover:shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Total Leads
                </span>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <line x1="20" y1="8" x2="20" y2="14" />
                    <line x1="23" y1="11" x2="17" y2="11" />
                  </svg>
                </div>
              </div>
              <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {totalLeadsCount}
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                <strong className="text-teal-600 dark:text-teal-400 font-semibold">{activeLeadsCount}</strong> active pipeline · {convertedLeadsCount} converted
              </p>
            </div>

            {/* Card 2: Accounts */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-shadow hover:shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Accounts
                </span>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 21h18" />
                    <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
                  </svg>
                </div>
              </div>
              <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {totalAccountsCount}
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Active corporate client entities linked to Party
              </p>
            </div>

            {/* Card 3: Lead Conversion Rate */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-shadow hover:shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Conversion Rate
                </span>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
              </div>
              <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {conversionRate}%
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {convertedLeadsCount} of {totalLeadsCount} leads converted into accounts
              </p>
            </div>

            {/* Card 4: Opportunities & Pipeline */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-shadow hover:shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Pipeline Value
                </span>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>
              </div>
              <div className="mt-3 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <span>Active Model</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                  Schema in DB
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Opportunity valuation linked to converted accounts
              </p>
            </div>
          </div>

          {/* Real Lead Funnel Visualization */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Lead Qualification Funnel
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Real-time prospect lifecycle progression computed directly from tenant database records.
                </p>
              </div>
              <span className="text-xs font-medium text-slate-500">
                Total Pipeline: <strong className="text-slate-900 dark:text-slate-100">{totalLeadsCount}</strong> Leads
              </span>
            </div>

            {totalLeadsCount === 0 ? (
              <div className="py-8 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-lg">
                <p className="text-xs text-slate-500">No leads recorded yet. Add your first lead to visualize funnel progression.</p>
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                {/* Stage 1: New */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">1. New Inquiries</span>
                      <span className="text-slate-400">({newLeadsCount} leads)</span>
                    </div>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {totalLeadsCount > 0 ? Math.round((newLeadsCount / totalLeadsCount) * 100) : 0}%
                    </span>
                  </div>
                  <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-500 transition-all duration-500 rounded-full"
                      style={{ width: `${totalLeadsCount > 0 ? Math.max((newLeadsCount / totalLeadsCount) * 100, 2) : 0}%` }}
                    />
                  </div>
                </div>

                {/* Stage 2: Qualified */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">2. Qualified Prospects</span>
                      <span className="text-slate-400">({qualifiedLeadsCount} leads)</span>
                    </div>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {totalLeadsCount > 0 ? Math.round((qualifiedLeadsCount / totalLeadsCount) * 100) : 0}%
                    </span>
                  </div>
                  <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 transition-all duration-500 rounded-full"
                      style={{ width: `${totalLeadsCount > 0 ? Math.max((qualifiedLeadsCount / totalLeadsCount) * 100, 2) : 0}%` }}
                    />
                  </div>
                </div>

                {/* Stage 3: Converted */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">3. Converted Accounts</span>
                      <span className="text-slate-400">({convertedLeadsCount} accounts created)</span>
                    </div>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {totalLeadsCount > 0 ? Math.round((convertedLeadsCount / totalLeadsCount) * 100) : 0}%
                    </span>
                  </div>
                  <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
                      style={{ width: `${totalLeadsCount > 0 ? Math.max((convertedLeadsCount / totalLeadsCount) * 100, 2) : 0}%` }}
                    />
                  </div>
                </div>

                {/* Stage 4: Lost */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">4. Lost / Inactive</span>
                      <span className="text-slate-400">({lostLeadsCount} leads)</span>
                    </div>
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      {totalLeadsCount > 0 ? Math.round((lostLeadsCount / totalLeadsCount) * 100) : 0}%
                    </span>
                  </div>
                  <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-500 transition-all duration-500 rounded-full"
                      style={{ width: `${totalLeadsCount > 0 ? Math.max((lostLeadsCount / totalLeadsCount) * 100, 2) : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Dual Panels: Recent Leads & Recent Accounts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Panel 1: Recent Leads */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Recent Leads</h3>
                  <span className="text-xs text-slate-400">({allLeads.slice(0, 5).length})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setTab("leads")}
                  className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline"
                >
                  View All Leads →
                </button>
              </div>

              {allLeads.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No leads registered yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {allLeads.slice(0, 5).map((lead) => {
                    const isConverted = lead.status.toLowerCase() === "converted";
                    return (
                      <div key={lead.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => setViewingLead(lead)}
                            className="text-xs font-semibold text-slate-900 dark:text-slate-100 hover:text-teal-600 hover:underline truncate block text-left"
                          >
                            {lead.title}
                          </button>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            {lead.email ? (
                              <span className="truncate">{lead.email}</span>
                            ) : (
                              <span>No email</span>
                            )}
                            <span>·</span>
                            <span className="capitalize">{lead.status}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isConverted ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200">
                              Converted
                            </span>
                          ) : (
                            canManage && (
                              <Button
                                size="sm"
                                variant="secondary"
                                type="button"
                                onClick={() => setConvertingLead(lead)}
                              >
                                Convert
                              </Button>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Panel 2: Recent Accounts */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Enterprise Accounts</h3>
                  <span className="text-xs text-slate-400">({allAccounts.slice(0, 5).length})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setTab("accounts")}
                  className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline"
                >
                  View All Accounts →
                </button>
              </div>

              {allAccounts.length === 0 ? (
                <div className="text-xs text-slate-500 py-6 text-center">
                  <p>No converted enterprise accounts yet.</p>
                  <p className="mt-1 text-[11px] text-slate-400">Converting qualified leads will establish account records here.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {allAccounts.slice(0, 5).map((account) => (
                    <div key={account.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setViewingAccount(account)}
                          className="text-xs font-semibold text-slate-900 dark:text-slate-100 hover:text-teal-600 hover:underline truncate block text-left"
                        >
                          {account.name}
                        </button>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span>Party:</span>
                          <strong className="text-slate-700 dark:text-slate-300">{account.party}</strong>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setViewingAccount(account)}
                        className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                        title="View Account Details"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB 2: LEADS MANAGEMENT ===================== */}
      {currentTab === "leads" && (
        <div className="space-y-4">
          {/* Filter Toolbar */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {/* Search by Title, Email, or UUID */}
              <div className="relative flex-1 min-w-[240px]">
                <svg
                  className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search leads by title, email, or ID..."
                  value={leadSearch}
                  onChange={(e) => {
                    setLeadSearch(e.target.value);
                    setLeadPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 py-2 pl-9 pr-3 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-teal-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition"
                />
                {leadSearch && (
                  <button
                    type="button"
                    onClick={() => setLeadSearch("")}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                )}
              </div>

              {/* Status Filter */}
              <div className="w-full sm:w-44">
                <select
                  value={leadStatusFilter}
                  onChange={(e) => {
                    setLeadStatusFilter(e.target.value);
                    setLeadPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 focus:border-teal-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition"
                >
                  <option value="all">All Statuses</option>
                  <option value="new">New</option>
                  <option value="qualified">Qualified</option>
                  <option value="converted">Converted</option>
                  <option value="lost">Lost</option>
                </select>
              </div>

              {/* Clear Filter button */}
              {(leadSearch || leadStatusFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setLeadSearch("");
                    setLeadStatusFilter("all");
                    setLeadPage(1);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                  Reset
                </button>
              )}
            </div>

            {/* Sub-toolbar count & actions */}
            <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
              <span>
                Showing <strong className="text-slate-800 dark:text-slate-200">{sortedLeads.length}</strong> of{" "}
                <strong className="text-slate-800 dark:text-slate-200">{totalLeadsCount}</strong> leads
              </span>
              {sortedLeads.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportLeadsCsv}
                  className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:underline font-medium"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export Leads CSV
                </button>
              )}
            </div>
          </div>

          {/* Leads Table Container */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
            {/* Batch Selection Banner */}
            {selectedLeadIds.size > 0 && (
              <div className="flex items-center justify-between bg-teal-50/80 dark:bg-teal-950/40 px-4 py-2.5 border-b border-teal-200/80 dark:border-teal-800/80 text-xs text-teal-900 dark:text-teal-200">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{selectedLeadIds.size}</span>
                  <span>leads selected</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportLeadsCsv}
                    className="rounded bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-1 text-xs font-medium transition"
                  >
                    Export Selected ({selectedLeadIds.size})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedLeadIds(new Set())}
                    className="text-teal-700 dark:text-teal-300 hover:underline font-medium px-2 py-1"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>
            )}

            {sortedLeads.length === 0 ? (
              <div className="py-16 px-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <line x1="20" y1="8" x2="20" y2="14" />
                    <line x1="23" y1="11" x2="17" y2="11" />
                  </svg>
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                  {allLeads.length === 0 ? "No leads in pipeline" : "No matching leads found"}
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  {allLeads.length === 0
                    ? "Add your first sales prospect or lead to begin nurturing your customer pipeline."
                    : "Try adjusting or clearing your search criteria or status filter."}
                </p>
                <div className="mt-5">
                  {allLeads.length === 0 ? (
                    canManage && (
                      <Button
                        type="button"
                        onClick={() => {
                          setAddTitle("");
                          setAddEmail("");
                          setAddError("");
                          setIsAddLeadOpen(true);
                        }}
                      >
                        + Add Lead
                      </Button>
                    )
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setLeadSearch("");
                        setLeadStatusFilter("all");
                      }}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 font-semibold select-none">
                      {/* Checkbox Header */}
                      <th className="py-3 px-4 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={isAllLeadsSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = isSomeLeadsSelected;
                          }}
                          onChange={toggleSelectAllLeads}
                          aria-label="Select all leads"
                          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer h-3.5 w-3.5"
                        />
                      </th>

                      {/* Lead Title */}
                      <th
                        className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                        onClick={() => handleLeadSort("title")}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Lead / Company</span>
                          {leadSortField === "title" && (
                            <span className="text-teal-600 dark:text-teal-400">
                              {leadSortOrder === "asc" ? "▲" : "▼"}
                            </span>
                          )}
                        </div>
                      </th>

                      {/* Contact Email */}
                      <th
                        className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                        onClick={() => handleLeadSort("email")}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Contact Email</span>
                          {leadSortField === "email" && (
                            <span className="text-teal-600 dark:text-teal-400">
                              {leadSortOrder === "asc" ? "▲" : "▼"}
                            </span>
                          )}
                        </div>
                      </th>

                      {/* Status */}
                      <th
                        className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                        onClick={() => handleLeadSort("status")}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Status</span>
                          {leadSortField === "status" && (
                            <span className="text-teal-600 dark:text-teal-400">
                              {leadSortOrder === "asc" ? "▲" : "▼"}
                            </span>
                          )}
                        </div>
                      </th>

                      {/* Associated Party */}
                      <th className="py-3 px-4">Party Association</th>

                      {/* Actions */}
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                    {paginatedLeads.map((lead) => {
                      const isSelected = selectedLeadIds.has(lead.id);
                      const isConverted = lead.status.toLowerCase() === "converted";
                      const isQualified = lead.status.toLowerCase() === "qualified";
                      const isNew = lead.status.toLowerCase() === "new";

                      // Status Badge Styling
                      let statusBadgeClass =
                        "bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400";
                      let dotColor = "bg-slate-400";

                      if (isConverted) {
                        statusBadgeClass =
                          "bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800";
                        dotColor = "bg-emerald-500";
                      } else if (isQualified) {
                        statusBadgeClass =
                          "bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800";
                        dotColor = "bg-amber-500";
                      } else if (isNew) {
                        statusBadgeClass =
                          "bg-sky-50 text-sky-700 border border-sky-200/80 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800";
                        dotColor = "bg-sky-500";
                      }

                      return (
                        <tr
                          key={lead.id}
                          className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                            isSelected ? "bg-teal-50/30 dark:bg-teal-950/20" : ""
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="py-3 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectLead(lead.id)}
                              aria-label={`Select ${lead.title}`}
                              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer h-3.5 w-3.5"
                            />
                          </td>

                          {/* Title & Avatar */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300 font-semibold text-xs border border-teal-200/60 dark:border-teal-800/60">
                                {initials(lead.title)}
                              </div>
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() => setViewingLead(lead)}
                                  className="font-semibold text-slate-900 dark:text-slate-100 hover:text-teal-600 dark:hover:text-teal-400 hover:underline text-left block truncate"
                                >
                                  {lead.title}
                                </button>
                                <span className="text-[11px] text-slate-400">
                                  ID: {lead.id.slice(0, 8)}...
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Email */}
                          <td className="py-3 px-4">
                            {lead.email ? (
                              <a
                                href={`mailto:${lead.email}`}
                                className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 hover:underline"
                              >
                                <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                  <polyline points="22,6 12,13 2,6" />
                                </svg>
                                {lead.email}
                              </a>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Status Badge */}
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${statusBadgeClass}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                              {lead.status}
                            </span>
                          </td>

                          {/* Party Link */}
                          <td className="py-3 px-4">
                            {lead.party_id ? (
                              <Link
                                to="/app/parties"
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-600 dark:text-teal-400 hover:underline"
                              >
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                </svg>
                                Linked Party
                              </Link>
                            ) : (
                              <span className="text-[11px] text-slate-400">Not converted</span>
                            )}
                          </td>

                          {/* Row Actions */}
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {/* Details button */}
                              <button
                                type="button"
                                title="View Lead Details"
                                onClick={() => setViewingLead(lead)}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 transition"
                              >
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              </button>

                              {/* Convert Button */}
                              {canManage && (
                                isConverted ? (
                                  <span className="text-[11px] text-slate-400 font-medium px-2 py-0.5">
                                    Done
                                  </span>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    type="button"
                                    onClick={() => setConvertingLead(lead)}
                                    className="text-xs"
                                  >
                                    Convert
                                  </Button>
                                )
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {sortedLeads.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <span>Rows per page:</span>
                  <select
                    value={leadPageSize}
                    onChange={(e) => {
                      setLeadPageSize(Number(e.target.value));
                      setLeadPage(1);
                    }}
                    className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                  <span className="ml-2 text-slate-400">|</span>
                  <span className="ml-2">
                    Page <strong className="text-slate-700 dark:text-slate-200">{leadPage}</strong> of{" "}
                    <strong className="text-slate-700 dark:text-slate-200">{totalLeadPages}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  <button
                    type="button"
                    disabled={leadPage <= 1}
                    onClick={() => setLeadPage((prev) => Math.max(prev - 1, 1))}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    ← Previous
                  </button>
                  <button
                    type="button"
                    disabled={leadPage >= totalLeadPages}
                    onClick={() => setLeadPage((prev) => Math.min(prev + 1, totalLeadPages))}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== TAB 3: ACCOUNTS MANAGEMENT ===================== */}
      {currentTab === "accounts" && (
        <div className="space-y-4">
          {/* Accounts Filter Toolbar */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {/* Search Accounts */}
              <div className="relative flex-1 min-w-[240px]">
                <svg
                  className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search accounts by name or linked party..."
                  value={accountSearch}
                  onChange={(e) => {
                    setAccountSearch(e.target.value);
                    setAccountPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 py-2 pl-9 pr-3 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-teal-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition"
                />
                {accountSearch && (
                  <button
                    type="button"
                    onClick={() => setAccountSearch("")}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                )}
              </div>

              {accountSearch && (
                <button
                  type="button"
                  onClick={() => setAccountSearch("")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                >
                  Reset Search
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
              <span>
                Showing <strong className="text-slate-800 dark:text-slate-200">{sortedAccounts.length}</strong> of{" "}
                <strong className="text-slate-800 dark:text-slate-200">{totalAccountsCount}</strong> accounts
              </span>
              {sortedAccounts.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportAccountsCsv}
                  className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:underline font-medium"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export Accounts CSV
                </button>
              )}
            </div>
          </div>

          {/* Accounts Data Table */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
            {sortedAccounts.length === 0 ? (
              <div className="py-16 px-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 21h18" />
                    <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
                  </svg>
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                  {allAccounts.length === 0 ? "No accounts registered yet" : "No matching accounts found"}
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  {allAccounts.length === 0
                    ? "Converting qualified leads will automatically generate enterprise account records linked to the Parties directory."
                    : "Try adjusting or clearing your search keywords."}
                </p>
                <div className="mt-5">
                  <Button type="button" variant="secondary" onClick={() => setTab("leads")}>
                    Go to Leads Pipeline
                  </Button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 font-semibold select-none">
                      {/* Name */}
                      <th
                        className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                        onClick={() => handleAccountSort("name")}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Account Name</span>
                          {accountSortField === "name" && (
                            <span className="text-teal-600 dark:text-teal-400">
                              {accountSortOrder === "asc" ? "▲" : "▼"}
                            </span>
                          )}
                        </div>
                      </th>

                      {/* Linked Party */}
                      <th
                        className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                        onClick={() => handleAccountSort("party")}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Linked Organization Party</span>
                          {accountSortField === "party" && (
                            <span className="text-teal-600 dark:text-teal-400">
                              {accountSortOrder === "asc" ? "▲" : "▼"}
                            </span>
                          )}
                        </div>
                      </th>

                      {/* Party ID */}
                      <th className="py-3 px-4">Party UUID</th>

                      {/* Status */}
                      <th className="py-3 px-4">Account Status</th>

                      {/* Actions */}
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                    {paginatedAccounts.map((account) => {
                      const partyDetail = partiesById.get(account.party_id);
                      return (
                        <tr
                          key={account.id}
                          className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                        >
                          {/* Name */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 font-semibold text-xs border border-sky-200/60 dark:border-sky-800/60">
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M3 21h18" />
                                  <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
                                </svg>
                              </div>
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() => setViewingAccount(account)}
                                  className="font-semibold text-slate-900 dark:text-slate-100 hover:text-teal-600 dark:hover:text-teal-400 hover:underline text-left block truncate"
                                >
                                  {account.name}
                                </button>
                                <span className="text-[11px] text-slate-400">
                                  ID: {account.id.slice(0, 8)}...
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Linked Party */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-slate-800 dark:text-slate-200">
                                {account.party}
                              </span>
                              {partyDetail && (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                                  Org
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Party UUID */}
                          <td className="py-3 px-4">
                            <Link
                              to="/app/parties"
                              className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
                              title="Inspect in Parties Module"
                            >
                              <span>{account.party_id.slice(0, 10)}...</span>
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                              </svg>
                            </Link>
                          </td>

                          {/* Account Status */}
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Active Account
                            </span>
                          </td>

                          {/* Row Actions */}
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => setViewingAccount(account)}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 transition"
                              title="View Account Details"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {sortedAccounts.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <span>Rows per page:</span>
                  <select
                    value={accountPageSize}
                    onChange={(e) => {
                      setAccountPageSize(Number(e.target.value));
                      setAccountPage(1);
                    }}
                    className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                  <span className="ml-2 text-slate-400">|</span>
                  <span className="ml-2">
                    Page <strong className="text-slate-700 dark:text-slate-200">{accountPage}</strong> of{" "}
                    <strong className="text-slate-700 dark:text-slate-200">{totalAccountPages}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  <button
                    type="button"
                    disabled={accountPage <= 1}
                    onClick={() => setAccountPage((prev) => Math.max(prev - 1, 1))}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    ← Previous
                  </button>
                  <button
                    type="button"
                    disabled={accountPage >= totalAccountPages}
                    onClick={() => setAccountPage((prev) => Math.min(prev + 1, totalAccountPages))}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== TAB 4: OPPORTUNITIES & PIPELINE ===================== */}
      {currentTab === "opportunities" && (
        <div className="space-y-6">
          {/* Architectural Information Card */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Opportunities & Deal Pipeline Architecture
                  </h2>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    Database Schema Active
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  In Pulse ERP, the backend data model incorporates a dedicated <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-teal-600">Opportunity</code> model with multi-tenant company isolation, linked accounts, deal values in INR minor units (<code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-teal-600">amount_minor</code>), and stage classifications.
                </p>
                <div className="mt-3 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                  <div className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200">
                    <svg className="h-4 w-4 text-teal-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <span>Backend Status Disclosure (Zero Fabricated Data Principle)</span>
                  </div>
                  <p className="pl-6 text-[11px] leading-normal text-slate-500 dark:text-slate-400">
                    While opportunities are stored in the database and automatically initialized when leads are converted, the Pulse backend API does not currently expose a separate REST endpoint (<code>/api/v1/companies/&lt;id&gt;/crm/opportunities/</code>). To maintain absolute data integrity and avoid presenting misleading mock statistics, real deal records will populate this view as soon as the REST endpoint is connected.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Supported Opportunity Stages from models.py */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Standard Opportunity Stage Lifecycle
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              {/* Stage 1 */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
                <span className="text-[10px] font-bold uppercase text-sky-600 dark:text-sky-400 tracking-wider">
                  Stage 1
                </span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1">Qualification</h4>
                <p className="mt-1 text-[11px] text-slate-500">Initial lead assessment & requirements discovery.</p>
                <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                  <span>Auto-created on lead conversion</span>
                </div>
              </div>

              {/* Stage 2 */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
                <span className="text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">
                  Stage 2
                </span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1">Proposal</h4>
                <p className="mt-1 text-[11px] text-slate-500">Commercial quote, solution architecture & scope.</p>
                <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  <span>Commercial presentation</span>
                </div>
              </div>

              {/* Stage 3 */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
                <span className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400 tracking-wider">
                  Stage 3
                </span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1">Negotiation</h4>
                <p className="mt-1 text-[11px] text-slate-500">Contractual terms, legal review & payment schedules.</p>
                <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  <span>Active decision cycle</span>
                </div>
              </div>

              {/* Stage 4 */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
                <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">
                  Stage 4
                </span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1">Closed Won</h4>
                <p className="mt-1 text-[11px] text-slate-500">Final agreement executed & transferred to Commerce / Projects.</p>
                <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span>Revenue recognized</span>
                </div>
              </div>

              {/* Stage 5 */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
                <span className="text-[10px] font-bold uppercase text-rose-600 dark:text-rose-400 tracking-wider">
                  Stage 5
                </span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1">Closed Lost</h4>
                <p className="mt-1 text-[11px] text-slate-500">Post-evaluation disqualification or competitor decision.</p>
                <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  <span>Reason logged for analytics</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB 5: ACTIVITIES ===================== */}
      {currentTab === "activities" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center shadow-xs">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-900 dark:text-slate-100">
              CRM Interaction Timeline & Activity History
            </h3>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
              Interaction logging (calls, emails, meetings, and prospect notes) is captured centrally through the Pulse ERP Company Audit Trail. To preserve platform data integrity, zero synthetic or fake activity logs are generated here.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link to="/app/audit">
                <Button variant="secondary" className="flex items-center gap-1.5 text-xs">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  Inspect Company Audit Log
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: ADD LEAD ===================== */}
      <Modal
        open={isAddLeadOpen}
        onClose={() => setIsAddLeadOpen(false)}
        title="Add New Lead"
        description="Register a prospective customer or company in your sales pipeline."
      >
        <form onSubmit={handleCreateLeadSubmit} className="space-y-4">
          {addError && (
            <div className="rounded-lg bg-rose-50 dark:bg-rose-950/50 p-3 text-xs text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
              {addError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Lead / Company Title <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              placeholder="e.g. Acme Tech Solutions Pvt Ltd"
              required
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Contact Email Address
            </label>
            <input
              type="email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder="e.g. contact@acmetech.example"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button type="button" variant="secondary" onClick={() => setIsAddLeadOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createLeadMutation.isPending || !addTitle.trim()}>
              {createLeadMutation.isPending ? "Adding..." : "Add Lead"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ===================== MODAL: CONVERT LEAD ===================== */}
      <Modal
        open={Boolean(convertingLead)}
        onClose={() => setConvertingLead(null)}
        title="Convert Lead to Account"
        description="Transform this qualified prospective lead into an active enterprise customer."
      >
        {convertingLead && (
          <div className="space-y-4">
            <div className="rounded-xl bg-teal-50/70 dark:bg-teal-950/40 p-4 border border-teal-200/80 dark:border-teal-800/80">
              <h4 className="text-xs font-bold text-teal-900 dark:text-teal-200 mb-1.5">
                Conversion Actions in Pulse ERP:
              </h4>
              <ul className="text-xs text-teal-800 dark:text-teal-300 space-y-1 list-disc list-inside">
                <li>Creates an <strong>Organization Party</strong> in the Parties directory.</li>
                <li>Creates an <strong>Enterprise Account</strong> linked to the new Party.</li>
                <li>Creates a <strong>Contact record</strong> with the lead contact details.</li>
                <li>Initializes a sales <strong>Opportunity</strong> in the qualification stage.</li>
                <li>Updates this lead status permanently to <strong>Converted</strong>.</li>
              </ul>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs">
              <div className="text-slate-500">Converting Lead:</div>
              <div className="font-bold text-slate-900 dark:text-slate-100 text-sm mt-0.5">
                {convertingLead.title}
              </div>
              {convertingLead.email && (
                <div className="text-slate-500 mt-1">
                  Email: <span className="text-slate-700 dark:text-slate-300">{convertingLead.email}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <Button type="button" variant="secondary" onClick={() => setConvertingLead(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={convertLeadMutation.isPending}
                onClick={() => convertLeadMutation.mutate(convertingLead.id)}
              >
                {convertLeadMutation.isPending ? "Converting..." : "Confirm & Convert"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ===================== MODAL: VIEW LEAD DETAILS ===================== */}
      <Modal
        open={Boolean(viewingLead)}
        onClose={() => setViewingLead(null)}
        title="Lead Profile Details"
        description="Comprehensive information and identifiers for this sales lead."
      >
        {viewingLead && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4 border border-slate-200/80 dark:border-slate-700">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200 font-bold text-sm">
                {initials(viewingLead.title)}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  {viewingLead.title}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                    Status: {viewingLead.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Contact Information
              </span>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Email Address:</span>
                  {viewingLead.email ? (
                    <a
                      href={`mailto:${viewingLead.email}`}
                      className="text-teal-600 dark:text-teal-400 font-medium hover:underline flex items-center gap-1"
                    >
                      {viewingLead.email}
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  ) : (
                    <span className="text-slate-400">Not provided</span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                System Identifiers
              </span>
              <div className="grid gap-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900 text-xs">
                <div>
                  <span className="text-[10px] uppercase text-slate-400 block">Lead UUID</span>
                  <span className="text-slate-700 dark:text-slate-300 break-all select-all">
                    {viewingLead.id}
                  </span>
                </div>
                {viewingLead.party_id && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] uppercase text-slate-400 block">Associated Party UUID</span>
                    <span className="text-slate-700 dark:text-slate-300 break-all select-all">
                      {viewingLead.party_id}
                    </span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] uppercase text-slate-400 block">Tenant Company ID</span>
                  <span className="text-slate-700 dark:text-slate-300 break-all select-all">
                    {companyId}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              {canManage && viewingLead.status.toLowerCase() !== "converted" && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    const target = viewingLead;
                    setViewingLead(null);
                    setConvertingLead(target);
                  }}
                >
                  Convert Lead
                </Button>
              )}
              <Button type="button" variant="secondary" onClick={() => setViewingLead(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ===================== MODAL: VIEW ACCOUNT DETAILS ===================== */}
      <Modal
        open={Boolean(viewingAccount)}
        onClose={() => setViewingAccount(null)}
        title="Enterprise Account Profile"
        description="Account details and linked Party records for this client."
      >
        {viewingAccount && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4 border border-slate-200/80 dark:border-slate-700">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200 font-bold text-sm">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 21h18" />
                  <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  {viewingAccount.name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Active Account
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Party Association
              </span>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Party Display Name:</span>
                  <strong className="text-slate-800 dark:text-slate-200">{viewingAccount.party}</strong>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 mt-2">
                  <span className="text-slate-500">Directory Action:</span>
                  <Link
                    to="/app/parties"
                    className="text-teal-600 dark:text-teal-400 font-medium hover:underline inline-flex items-center gap-1"
                  >
                    Open in Parties Module →
                  </Link>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                System Identifiers
              </span>
              <div className="grid gap-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900 text-xs">
                <div>
                  <span className="text-[10px] uppercase text-slate-400 block">Account UUID</span>
                  <span className="text-slate-700 dark:text-slate-300 break-all select-all">
                    {viewingAccount.id}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] uppercase text-slate-400 block">Party UUID</span>
                  <span className="text-slate-700 dark:text-slate-300 break-all select-all">
                    {viewingAccount.party_id}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] uppercase text-slate-400 block">Tenant Company ID</span>
                  <span className="text-slate-700 dark:text-slate-300 break-all select-all">
                    {companyId}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <Button type="button" onClick={() => setViewingAccount(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}