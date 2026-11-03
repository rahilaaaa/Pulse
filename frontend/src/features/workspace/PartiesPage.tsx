import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { Modal } from "../../shared/ui/Modal";
import { initials } from "./format";
import type { WorkspacePayload } from "./types";

export type PartyRow = {
  id: string;
  kind: "organization" | "person" | string;
  display_name: string;
  email: string;
  phone: string;
  status: "active" | "inactive" | string;
  created_at?: string;
};

type SortField = "display_name" | "kind" | "email" | "status";
type SortOrder = "asc" | "desc";

export function PartiesPage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const canManage = workspace.permissions.includes("parties.manage");
  const queryClient = useQueryClient();

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Sorting & Pagination states
  const [sortField, setSortField] = useState<SortField>("display_name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Selection states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [viewingParty, setViewingParty] = useState<PartyRow | null>(null);
  const [editingParty, setEditingParty] = useState<PartyRow | null>(null);

  // Add Party Form states
  const [addKind, setAddKind] = useState<"organization" | "person">("organization");
  const [addDisplayName, setAddDisplayName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addError, setAddError] = useState("");

  // Edit Party Form states
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editStatus, setEditStatus] = useState<"active" | "inactive">("active");
  const [editError, setEditError] = useState("");

  // Success alert/toast message
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }

  // Fetch Parties
  const partiesQuery = useQuery({
    queryKey: ["parties", companyId],
    queryFn: () => api<{ results: PartyRow[] }>(`/api/v1/companies/${companyId}/parties/`),
  });

  const allParties = partiesQuery.data?.results ?? [];

  // Summary Metrics computed from actual backend data
  const totalCount = allParties.length;
  const orgCount = allParties.filter((p) => p.kind.toLowerCase() === "organization").length;
  const personCount = allParties.filter((p) => p.kind.toLowerCase() === "person").length;

  // Filter logic
  const filteredParties = useMemo(() => {
    return allParties.filter((party) => {
      // Kind filter
      if (kindFilter !== "all" && party.kind.toLowerCase() !== kindFilter.toLowerCase()) {
        return false;
      }
      // Status filter
      if (statusFilter !== "all" && party.status.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }
      // Search filter across name, email, phone, or id
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchName = (party.display_name || "").toLowerCase().includes(query);
        const matchEmail = (party.email || "").toLowerCase().includes(query);
        const matchPhone = (party.phone || "").toLowerCase().includes(query);
        const matchId = (party.id || "").toLowerCase().includes(query);
        if (!matchName && !matchEmail && !matchPhone && !matchId) {
          return false;
        }
      }
      return true;
    });
  }, [allParties, kindFilter, statusFilter, searchQuery]);

  // Sorting logic
  const sortedParties = useMemo(() => {
    const list = [...filteredParties];
    list.sort((a, b) => {
      let valA = (a[sortField] || "").toLowerCase();
      let valB = (b[sortField] || "").toLowerCase();
      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredParties, sortField, sortOrder]);

  // Pagination logic
  const totalPages = Math.ceil(sortedParties.length / pageSize) || 1;
  const paginatedParties = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedParties.slice(start, start + pageSize);
  }, [sortedParties, currentPage, pageSize]);

  // Handle Sort Toggle
  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  }

  // Handle Reset Filters
  function handleResetFilters() {
    setSearchQuery("");
    setKindFilter("all");
    setStatusFilter("all");
    setCurrentPage(1);
  }

  // Handle Select All Checkbox
  const isAllSelected =
    paginatedParties.length > 0 && paginatedParties.every((p) => selectedIds.has(p.id));
  const isSomeSelected =
    paginatedParties.some((p) => selectedIds.has(p.id)) && !isAllSelected;

  function toggleSelectAll() {
    const next = new Set(selectedIds);
    if (isAllSelected) {
      paginatedParties.forEach((p) => next.delete(p.id));
    } else {
      paginatedParties.forEach((p) => next.add(p.id));
    }
    setSelectedIds(next);
  }

  function toggleSelectRow(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  }

  // CSV Export for selected or filtered
  function handleExportCsv() {
    const exportData =
      selectedIds.size > 0
        ? allParties.filter((p) => selectedIds.has(p.id))
        : sortedParties;

    if (exportData.length === 0) return;

    const headers = ["Name", "Kind", "Email", "Phone", "Status", "ID"];
    const rows = exportData.map((p) => [
      `"${p.display_name.replace(/"/g, '""')}"`,
      p.kind,
      p.email,
      p.phone,
      p.status,
      p.id,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `pulse-parties-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${exportData.length} parties to CSV.`);
  }

  // Create Party Mutation
  const createMutation = useMutation({
    mutationFn: (values: { display_name: string; kind: string; email: string; phone: string }) =>
      api(`/api/v1/companies/${companyId}/parties/`, {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["parties", companyId] });
      setIsAddOpen(false);
      setAddDisplayName("");
      setAddEmail("");
      setAddPhone("");
      setAddKind("organization");
      setAddError("");
      showToast("Party created successfully.");
    },
    onError: (err) => {
      setAddError(err instanceof ApiError ? err.message : "Failed to create party.");
    },
  });

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!addDisplayName.trim()) {
      setAddError("Please enter a party name.");
      return;
    }
    setAddError("");
    createMutation.mutate({
      display_name: addDisplayName.trim(),
      kind: addKind,
      email: addEmail.trim(),
      phone: addPhone.trim(),
    });
  }

  // Edit Party Mutation
  const updateMutation = useMutation({
    mutationFn: (values: { partyId: string; display_name: string; email: string; phone: string; status: string }) =>
      api(`/api/v1/companies/${companyId}/parties/${values.partyId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          display_name: values.display_name,
          email: values.email,
          phone: values.phone,
          status: values.status,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["parties", companyId] });
      setEditingParty(null);
      setEditError("");
      showToast("Party updated successfully.");
    },
    onError: (err) => {
      setEditError(err instanceof ApiError ? err.message : "Failed to update party.");
    },
  });

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingParty) return;
    if (!editDisplayName.trim()) {
      setEditError("Please enter a party name.");
      return;
    }
    setEditError("");
    updateMutation.mutate({
      partyId: editingParty.id,
      display_name: editDisplayName.trim(),
      email: editEmail.trim(),
      phone: editPhone.trim(),
      status: editStatus,
    });
  }

  function openEditModal(party: PartyRow) {
    setEditingParty(party);
    setEditDisplayName(party.display_name);
    setEditEmail(party.email || "");
    setEditPhone(party.phone || "");
    setEditStatus((party.status as "active" | "inactive") || "active");
    setEditError("");
  }

  // Quick Status Toggle Mutation
  const toggleStatusMutation = useMutation({
    mutationFn: ({ partyId, nextStatus }: { partyId: string; nextStatus: "active" | "inactive" }) =>
      api(`/api/v1/companies/${companyId}/parties/${partyId}/`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      }),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["parties", companyId] });
      showToast(`Party marked as ${variables.nextStatus}.`);
    },
  });

  // Loading & Error States
  if (partiesQuery.isLoading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
          <div className="space-y-2">
            <div className="h-8 w-44 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
            <div className="h-4 w-72 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
          </div>
          <div className="h-10 w-32 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
        </div>
        {/* Metric Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs animate-pulse" />
          ))}
        </div>
        {/* Table Skeleton */}
        <div className="h-96 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs animate-pulse" />
      </div>
    );
  }

  if (partiesQuery.isError) {
    return (
      <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-slate-100">Unable to load parties</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {partiesQuery.error instanceof ApiError ? partiesQuery.error.message : "You need parties.view permission to open this directory."}
        </p>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => partiesQuery.refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-3 text-sm font-medium text-white dark:text-slate-900 shadow-lg border border-slate-700 animate-fade-in">
          <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {toastMessage}
        </div>
      )}

      {/* 1. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Parties</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage your customers, suppliers, and business contacts.
          </p>
        </div>
        {canManage && (
          <Button
            type="button"
            onClick={() => {
              setAddError("");
              setAddDisplayName("");
              setAddEmail("");
              setAddPhone("");
              setAddKind("organization");
              setIsAddOpen(true);
            }}
            className="flex items-center gap-1.5 shadow-xs"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Party
          </Button>
        )}
      </div>

      {/* 2. SUMMARY METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Total Parties */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-shadow hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Parties
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {totalCount}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            All registered external partners
          </p>
        </div>

        {/* Card 2: Organizations */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-shadow hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Organizations
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18" />
                <path d="M9 8h1" />
                <path d="M9 12h1" />
                <path d="M9 16h1" />
                <path d="M14 8h1" />
                <path d="M14 12h1" />
                <path d="M14 16h1" />
                <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {orgCount}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Companies, vendors & corporate clients
          </p>
        </div>

        {/* Card 3: People */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-shadow hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              People
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {personCount}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Individual contacts & consultants
          </p>
        </div>
      </div>

      {/* 3. FILTER TOOLBAR */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px]">
            <svg
              className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 py-2 pl-9 pr-3 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-teal-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
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

          {/* Kind Filter Dropdown */}
          <div className="w-full sm:w-44">
            <select
              value={kindFilter}
              onChange={(e) => {
                setKindFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 focus:border-teal-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition"
            >
              <option value="all">All Kinds</option>
              <option value="organization">Organization</option>
              <option value="person">Person</option>
            </select>
          </div>

          {/* Status Filter Dropdown */}
          <div className="w-full sm:w-44">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 focus:border-teal-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Reset Filters Button */}
          {(searchQuery || kindFilter !== "all" || statusFilter !== "all") && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Reset Filters
            </button>
          )}
        </div>

        {/* Filter Results Info / Active Filter Badges */}
        <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
          <span>
            Showing <strong className="text-slate-800 dark:text-slate-200">{sortedParties.length}</strong> of{" "}
            <strong className="text-slate-800 dark:text-slate-200">{totalCount}</strong> parties
          </span>
          {sortedParties.length > 0 && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:underline font-medium"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export to CSV
            </button>
          )}
        </div>
      </div>

      {/* 4. PARTIES DATA TABLE */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        {/* Selection Bar (Active when 1 or more rows selected) */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between bg-teal-50/80 dark:bg-teal-950/40 px-4 py-2.5 border-b border-teal-200/80 dark:border-teal-800/80 text-xs text-teal-900 dark:text-teal-200">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{selectedIds.size}</span>
              <span>parties selected</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                className="rounded bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-1 text-xs font-medium transition"
              >
                Export Selected ({selectedIds.size})
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-teal-700 dark:text-teal-300 hover:underline font-medium px-2 py-1"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}

        {sortedParties.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
              {allParties.length === 0 ? "No parties yet" : "No matching parties found"}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              {allParties.length === 0
                ? "External customers, suppliers, and business contacts will appear in this directory."
                : "Try adjusting or clearing your search keywords and filter criteria."}
            </p>
            <div className="mt-5">
              {allParties.length === 0 ? (
                canManage && (
                  <Button
                    type="button"
                    onClick={() => {
                      setAddError("");
                      setAddDisplayName("");
                      setAddEmail("");
                      setAddPhone("");
                      setAddKind("organization");
                      setIsAddOpen(true);
                    }}
                  >
                    + Add Party
                  </Button>
                )
              ) : (
                <Button type="button" variant="secondary" onClick={handleResetFilters}>
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
                      checked={isAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = isSomeSelected;
                      }}
                      onChange={toggleSelectAll}
                      aria-label="Select all parties"
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer h-3.5 w-3.5"
                    />
                  </th>

                  {/* Name (Sortable) */}
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                    onClick={() => handleSort("display_name")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Name</span>
                      {sortField === "display_name" && (
                        <span className="text-teal-600 dark:text-teal-400">
                          {sortOrder === "asc" ? "▲" : "▼"}
                        </span>
                      )}
                    </div>
                  </th>

                  {/* Kind (Sortable) */}
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                    onClick={() => handleSort("kind")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Kind</span>
                      {sortField === "kind" && (
                        <span className="text-teal-600 dark:text-teal-400">
                          {sortOrder === "asc" ? "▲" : "▼"}
                        </span>
                      )}
                    </div>
                  </th>

                  {/* Email (Sortable) */}
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                    onClick={() => handleSort("email")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Email</span>
                      {sortField === "email" && (
                        <span className="text-teal-600 dark:text-teal-400">
                          {sortOrder === "asc" ? "▲" : "▼"}
                        </span>
                      )}
                    </div>
                  </th>

                  {/* Status (Sortable) */}
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                    onClick={() => handleSort("status")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Status</span>
                      {sortField === "status" && (
                        <span className="text-teal-600 dark:text-teal-400">
                          {sortOrder === "asc" ? "▲" : "▼"}
                        </span>
                      )}
                    </div>
                  </th>

                  {/* Created On */}
                  <th className="py-3 px-4">Created On</th>

                  {/* Actions Header */}
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                {paginatedParties.map((party) => {
                  const isOrg = party.kind.toLowerCase() === "organization";
                  const isActive = party.status.toLowerCase() === "active";
                  const isChecked = selectedIds.has(party.id);

                  return (
                    <tr
                      key={party.id}
                      className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                        isChecked ? "bg-teal-50/30 dark:bg-teal-950/20" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectRow(party.id)}
                          aria-label={`Select ${party.display_name}`}
                          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer h-3.5 w-3.5"
                        />
                      </td>

                      {/* Name + Avatar */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-semibold text-xs ${
                              isOrg
                                ? "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60"
                                : "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60"
                            }`}
                          >
                            {isOrg ? (
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 21h18" />
                                <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
                              </svg>
                            ) : (
                              initials(party.display_name)
                            )}
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() => setViewingParty(party)}
                              className="font-semibold text-slate-900 dark:text-slate-100 hover:text-teal-600 dark:hover:text-teal-400 hover:underline text-left block"
                            >
                              {party.display_name}
                            </button>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {party.phone ? party.phone : `ID: ${party.id.slice(0, 8)}...`}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Kind */}
                      <td className="py-3 px-4">
                        {isOrg ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200/60 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/80">
                            <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 21h18" />
                              <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
                            </svg>
                            Organization
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200/60 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/80">
                            <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                            Person
                          </span>
                        )}
                      </td>

                      {/* Email */}
                      <td className="py-3 px-4">
                        {party.email ? (
                          <a
                            href={`mailto:${party.email}`}
                            className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 hover:underline"
                          >
                            <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                              <polyline points="22,6 12,13 2,6" />
                            </svg>
                            {party.email}
                          </a>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">—</span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                            isActive
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800"
                              : "bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isActive ? "bg-emerald-500" : "bg-slate-400"
                            }`}
                          />
                          {party.status}
                        </span>
                      </td>

                      {/* Created On */}
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                        {party.created_at
                          ? new Date(party.created_at).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })
                          : "Active record"}
                      </td>

                      {/* Row Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          {/* View Button */}
                          <button
                            type="button"
                            title="View details"
                            onClick={() => setViewingParty(party)}
                            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 transition"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>

                          {/* Edit Button */}
                          {canManage && (
                            <button
                              type="button"
                              title="Edit party"
                              onClick={() => openEditModal(party)}
                              className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-teal-600 dark:hover:text-teal-400 transition"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                          )}

                          {/* Quick Toggle Status */}
                          {canManage && (
                            <button
                              type="button"
                              title={isActive ? "Deactivate party" : "Activate party"}
                              disabled={toggleStatusMutation.isPending}
                              onClick={() =>
                                toggleStatusMutation.mutate({
                                  partyId: party.id,
                                  nextStatus: isActive ? "inactive" : "active",
                                })
                              }
                              className={`rounded p-1 transition ${
                                isActive
                                  ? "text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                  : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                              }`}
                            >
                              {isActive ? (
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                                </svg>
                              ) : (
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                  <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                              )}
                            </button>
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

        {/* 5. TABLE FOOTER / PAGINATION */}
        {sortedParties.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
            {/* Page Size Selector */}
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span className="ml-2 text-slate-400">|</span>
              <span className="ml-2">
                Page <strong className="text-slate-700 dark:text-slate-200">{currentPage}</strong> of{" "}
                <strong className="text-slate-700 dark:text-slate-200">{totalPages}</strong>
              </span>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                ← Previous
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 6. ADD PARTY MODAL */}
      <Modal
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add New Party"
        description="Register a new external customer, supplier, or business contact."
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {addError && (
            <div className="rounded-lg bg-rose-50 dark:bg-rose-950/50 p-3 text-xs text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
              {addError}
            </div>
          )}

          {/* Party Kind Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Party Kind
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAddKind("organization")}
                className={`flex items-center gap-2.5 p-3 rounded-lg border text-left transition ${
                  addKind === "organization"
                    ? "border-teal-600 bg-teal-50/50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200 ring-1 ring-teal-600"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <div
                  className={`p-1.5 rounded ${
                    addKind === "organization"
                      ? "bg-teal-600 text-white"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-500"
                  }`}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 21h18" />
                    <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs font-semibold">Organization</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Companies & vendors</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAddKind("person")}
                className={`flex items-center gap-2.5 p-3 rounded-lg border text-left transition ${
                  addKind === "person"
                    ? "border-teal-600 bg-teal-50/50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200 ring-1 ring-teal-600"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <div
                  className={`p-1.5 rounded ${
                    addKind === "person"
                      ? "bg-teal-600 text-white"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-500"
                  }`}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs font-semibold">Person</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Individuals & contacts</div>
                </div>
              </button>
            </div>
          </div>

          {/* Party Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {addKind === "organization" ? "Organization / Company Name" : "Full Name"} <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              value={addDisplayName}
              onChange={(e) => setAddDisplayName(e.target.value)}
              placeholder={addKind === "organization" ? "e.g. Acme Corporation Pvt Ltd" : "e.g. John Doe"}
              required
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          {/* Email Address */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {addKind === "organization" ? "Primary Business Email" : "Contact Email"}
            </label>
            <input
              type="email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder={addKind === "organization" ? "contact@acmecorp.com" : "john.doe@example.com"}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              value={addPhone}
              onChange={(e) => setAddPhone(e.target.value)}
              placeholder="e.g. +91 98765 43210"
              maxLength={64}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          {/* Modal Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button type="button" variant="secondary" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || !addDisplayName.trim()}>
              {createMutation.isPending ? "Creating..." : "Create Party"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 7. EDIT PARTY MODAL */}
      <Modal
        open={Boolean(editingParty)}
        onClose={() => setEditingParty(null)}
        title={`Edit Party: ${editingParty?.display_name ?? ""}`}
        description="Update party contact details and operational status."
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {editError && (
            <div className="rounded-lg bg-rose-50 dark:bg-rose-950/50 p-3 text-xs text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
              {editError}
            </div>
          )}

          {/* Kind (Read-only badge) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Party Kind
            </label>
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <span className="font-semibold capitalize">{editingParty?.kind}</span>
              <span className="text-slate-400 text-[11px]">(Entity kind is fixed after creation)</span>
            </div>
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Party Name <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              maxLength={64}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Lifecycle Status
            </label>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as "active" | "inactive")}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Modal Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button type="button" variant="secondary" onClick={() => setEditingParty(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending || !editDisplayName.trim()}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 8. VIEW PARTY DETAILS MODAL */}
      <Modal
        open={Boolean(viewingParty)}
        onClose={() => setViewingParty(null)}
        title="Party Details"
        description="Comprehensive profile and contact identifiers for this party."
      >
        {viewingParty && (
          <div className="space-y-4">
            {/* Header info */}
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4 border border-slate-200/80 dark:border-slate-700">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-bold text-sm ${
                  viewingParty.kind.toLowerCase() === "organization"
                    ? "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200"
                    : "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200"
                }`}
              >
                {viewingParty.kind.toLowerCase() === "organization" ? (
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 21h18" />
                    <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
                  </svg>
                ) : (
                  initials(viewingParty.display_name)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  {viewingParty.display_name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="capitalize text-xs font-medium text-slate-500 dark:text-slate-400">
                    {viewingParty.kind}
                  </span>
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                      viewingParty.status.toLowerCase() === "active"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {viewingParty.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Contact details */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Contact Information
              </span>
              <div className="grid gap-2.5 rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Email Address:</span>
                  {viewingParty.email ? (
                    <a
                      href={`mailto:${viewingParty.email}`}
                      className="text-teal-600 dark:text-teal-400 font-medium hover:underline flex items-center gap-1"
                    >
                      {viewingParty.email}
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

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Phone Number:</span>
                  {viewingParty.phone ? (
                    <a
                      href={`tel:${viewingParty.phone}`}
                      className="text-slate-900 dark:text-slate-100 font-medium hover:text-teal-600"
                    >
                      {viewingParty.phone}
                    </a>
                  ) : (
                    <span className="text-slate-400">Not provided</span>
                  )}
                </div>
              </div>
            </div>

            {/* System Identifiers */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                System Identifiers
              </span>
              <div className="grid gap-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900 text-xs">
                <div>
                  <span className="text-[10px] uppercase text-slate-400 block">Party UUID</span>
                  <span className="text-slate-700 dark:text-slate-300 break-all select-all">
                    {viewingParty.id}
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

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              {canManage && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const target = viewingParty;
                    setViewingParty(null);
                    openEditModal(target);
                  }}
                >
                  Edit Party
                </Button>
              )}
              <Button type="button" onClick={() => setViewingParty(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
