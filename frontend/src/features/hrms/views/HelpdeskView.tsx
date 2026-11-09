import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError } from "../../../shared/api/client";
import { Button } from "../../../shared/ui/Button";
import type { HRRequestRow } from "../types";

const panelClass = "rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-sm";
const labelClass = "text-xs font-semibold uppercase tracking-wider text-pulse-muted";

function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : "The request could not be completed.";
}

interface HelpdeskViewProps {
  companyId: string;
  permissions: string[];
  selectedEmploymentId: string;
}

export function HelpdeskView({
  companyId,
  permissions,
  selectedEmploymentId,
}: HelpdeskViewProps) {
  const queryClient = useQueryClient();
  const can = (code: string) => permissions.includes(code);
  const root = `/api/v1/companies/${companyId}/hrms`;

  const canManageAll = can("hrms.admin.view") || can("hrms.manager.view");

  type SubTab = "my_tickets" | "all_tickets";
  const [activeTab, setActiveTab] = useState<SubTab>(canManageAll ? "all_tickets" : "my_tickets");

  const [feedback, setFeedback] = useState<string | null>(null);

  // New ticket modal
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [category, setCategory] = useState<HRRequestRow["category"]>("general");
  const [priority, setPriority] = useState<HRRequestRow["priority"]>("medium");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  // Resolve / Update ticket modal
  const [selectedTicket, setSelectedTicket] = useState<HRRequestRow | null>(null);
  const [targetStatus, setTargetStatus] = useState<HRRequestRow["status"]>("resolved");
  const [resolutionText, setResolutionText] = useState("");

  // Filters
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Queries
  const myRequests = useQuery({
    queryKey: ["hrms-my-requests", companyId, selectedEmploymentId],
    queryFn: () => api<{ results: HRRequestRow[] }>(`${root}/me/requests/?employment_id=${selectedEmploymentId}`),
    enabled: Boolean(selectedEmploymentId),
  });

  const allRequests = useQuery({
    queryKey: ["hrms-all-requests", companyId],
    queryFn: () => api<{ results: HRRequestRow[] }>(`${root}/requests/`),
    enabled: canManageAll,
  });

  // Mutations
  const createRequest = useMutation({
    mutationFn: () =>
      api(`${root}/me/requests/`, {
        method: "POST",
        body: JSON.stringify({
          employment_id: selectedEmploymentId,
          category,
          priority,
          subject,
          description,
        }),
      }),
    onSuccess: async () => {
      setFeedback("HR request submitted successfully. Our team will review it shortly.");
      setShowSubmitModal(false);
      setSubject("");
      setDescription("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-my-requests", companyId, selectedEmploymentId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-all-requests", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-dashboard", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const updateRequest = useMutation({
    mutationFn: ({ id, status, resolution }: { id: string; status: string; resolution: string }) =>
      api(`${root}/requests/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ status, resolution }),
      }),
    onSuccess: async () => {
      setFeedback("Ticket status updated successfully.");
      setSelectedTicket(null);
      setResolutionText("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-my-requests", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-all-requests", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-dashboard", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const myTicketList = myRequests.data?.results ?? [];
  const rawAllList = allRequests.data?.results ?? [];

  const filteredAllList = rawAllList.filter((item) => {
    const matchCat = !filterCategory || item.category === filterCategory;
    const matchStat = !filterStatus || item.status === filterStatus;
    return matchCat && matchStat;
  });

  return (
    <div className="space-y-4">
      {/* Feedback Alert */}
      {feedback && (
        <div className="flex items-center justify-between rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Header and Controls */}
      <section className={panelClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-pulse-ink">HR Helpdesk & Inquiry Portal</h2>
            <p className="text-xs text-pulse-muted">
              Submit and resolve employee inquiries regarding benefits, payroll, policy, or grievances.
            </p>
          </div>
          <Button onClick={() => setShowSubmitModal(true)}>
            + Submit HR Request
          </Button>
        </div>

        {/* Sub-Tabs */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-pulse-border pt-3 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("my_tickets")}
            className={`rounded-md px-3 py-1.5 font-semibold transition ${
              activeTab === "my_tickets"
                ? "bg-pulse-accent text-white shadow-sm"
                : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            My Inquiries ({myTicketList.filter((t) => t.status !== "closed" && t.status !== "resolved").length})
          </button>

          {canManageAll && (
            <button
              type="button"
              onClick={() => setActiveTab("all_tickets")}
              className={`rounded-md px-3 py-1.5 font-semibold transition ${
                activeTab === "all_tickets"
                  ? "bg-pulse-accent text-white shadow-sm"
                  : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
              }`}
            >
              All Inquiries Queue ({rawAllList.filter((t) => t.status !== "closed" && t.status !== "resolved").length})
            </button>
          )}
        </div>
      </section>

      {/* SUB-TAB 1: My Personal Requests */}
      {activeTab === "my_tickets" && (
        <section className={`${panelClass} overflow-hidden p-0`}>
          <div className="p-4 border-b border-pulse-border">
            <h3 className="text-base font-bold text-pulse-ink">My Submitted Requests</h3>
          </div>
          {myTicketList.length === 0 ? (
            <div className="p-8 text-center text-xs text-pulse-muted">
              You haven't submitted any HR helpdesk requests yet. Click "+ Submit HR Request" to reach HR.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-pulse-border bg-pulse-hover/50 text-pulse-muted">
                    <th className="px-4 py-3 font-semibold">Subject</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Priority</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pulse-border">
                  {myTicketList.map((req) => (
                    <tr key={req.id} className="hover:bg-pulse-hover/60 cursor-pointer" onClick={() => setSelectedTicket(req)}>
                      <td className="px-4 py-3 font-semibold text-pulse-ink">{req.subject}</td>
                      <td className="px-4 py-3 capitalize text-pulse-muted">{req.category}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded px-1.5 py-0.2 text-[10px] font-bold uppercase ${
                            req.priority === "urgent" || req.priority === "high"
                              ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                              : "bg-pulse-hover text-pulse-muted"
                          }`}
                        >
                          {req.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            req.status === "resolved" || req.status === "closed"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : req.status === "in_progress"
                              ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                          }`}
                        >
                          {req.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-pulse-muted">
                        {req.created_at?.slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* SUB-TAB 2: All Company Requests Queue (Admin / Manager) */}
      {activeTab === "all_tickets" && (
        <section className={`${panelClass} overflow-hidden p-0`}>
          <div className="p-4 border-b border-pulse-border flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-bold text-pulse-ink">Inquiries Management Queue</h3>
            <div className="flex items-center gap-2">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="rounded border border-pulse-border bg-pulse-surface px-2.5 py-1 text-xs text-pulse-ink"
              >
                <option value="">All Categories</option>
                <option value="general">General</option>
                <option value="payroll">Payroll</option>
                <option value="benefits">Benefits</option>
                <option value="policy">Policy</option>
                <option value="grievance">Grievance</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded border border-pulse-border bg-pulse-surface px-2.5 py-1 text-xs text-pulse-ink"
              >
                <option value="">All Statuses</option>
                <option value="submitted">Submitted</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          {filteredAllList.length === 0 ? (
            <div className="p-8 text-center text-xs text-pulse-muted">
              No inquiries match the current filter selection.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-pulse-border bg-pulse-hover/50 text-pulse-muted">
                    <th className="px-4 py-3 font-semibold">Employee</th>
                    <th className="px-4 py-3 font-semibold">Subject</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Priority</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pulse-border">
                  {filteredAllList.map((req) => (
                    <tr key={req.id} className="hover:bg-pulse-hover/60">
                      <td className="px-4 py-3 font-semibold text-pulse-ink">{req.employee_name}</td>
                      <td className="px-4 py-3 font-medium text-pulse-ink">{req.subject}</td>
                      <td className="px-4 py-3 capitalize text-pulse-muted">{req.category}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded px-1.5 py-0.2 text-[10px] font-bold uppercase ${
                            req.priority === "urgent" || req.priority === "high"
                              ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                              : "bg-pulse-hover text-pulse-muted"
                          }`}
                        >
                          {req.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            req.status === "resolved" || req.status === "closed"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : req.status === "in_progress"
                              ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                          }`}
                        >
                          {req.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSelectedTicket(req);
                            setTargetStatus(req.status === "submitted" ? "in_progress" : "resolved");
                            setResolutionText(req.resolution || "");
                          }}
                        >
                          Manage
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Ticket Detail / Resolution Drawer */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
          <div className="w-full max-w-md bg-pulse-surface h-full shadow-2xl p-6 overflow-y-auto space-y-4 border-l border-pulse-border">
            <div className="flex items-center justify-between border-b border-pulse-border pb-3">
              <div>
                <h3 className="text-base font-bold text-pulse-ink">{selectedTicket.subject}</h3>
                <p className="text-xs text-pulse-muted">
                  From: {selectedTicket.employee_name} · {selectedTicket.category}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="text-pulse-muted hover:text-pulse-ink text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="rounded-md bg-pulse-hover/40 p-3 border border-pulse-border text-xs space-y-1">
              <span className={labelClass}>Inquiry Description</span>
              <p className="text-pulse-ink leading-relaxed whitespace-pre-wrap">{selectedTicket.description}</p>
            </div>

            {selectedTicket.resolution && (
              <div className="rounded-md bg-emerald-50/50 dark:bg-emerald-950/20 p-3 border border-emerald-200 dark:border-emerald-900 text-xs space-y-1">
                <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase">
                  Official Resolution
                </span>
                <p className="text-pulse-ink whitespace-pre-wrap">{selectedTicket.resolution}</p>
              </div>
            )}

            {canManageAll && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  updateRequest.mutate({
                    id: selectedTicket.id,
                    status: targetStatus,
                    resolution: resolutionText,
                  });
                }}
                className="space-y-3 pt-3 border-t border-pulse-border text-xs"
              >
                <h4 className="font-semibold text-pulse-ink">Update Status & Resolution</h4>
                <label className="block">
                  <span className="font-medium text-pulse-muted">Set Status</span>
                  <select
                    value={targetStatus}
                    onChange={(e) => setTargetStatus(e.target.value as HRRequestRow["status"])}
                    className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                  >
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>

                <label className="block">
                  <span className="font-medium text-pulse-muted">Resolution Note</span>
                  <textarea
                    rows={3}
                    placeholder="Provide details of resolution or reply..."
                    value={resolutionText}
                    onChange={(e) => setResolutionText(e.target.value)}
                    className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                  />
                </label>

                <Button type="submit" className="w-full" disabled={updateRequest.isPending}>
                  {updateRequest.isPending ? "Updating..." : "Save Resolution"}
                </Button>
              </form>
            )}

            <Button variant="secondary" className="w-full" onClick={() => setSelectedTicket(null)}>
              Close Panel
            </Button>
          </div>
        </div>
      )}

      {/* Submit HR Request Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-pulse-ink">Submit HR Request</h3>
            <p className="text-xs text-pulse-muted">
              Our human resources team will review and reply to your request.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createRequest.mutate();
              }}
              className="space-y-3 text-xs"
            >
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="font-semibold text-pulse-ink">Category *</span>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as HRRequestRow["category"])}
                    className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                  >
                    <option value="general">General</option>
                    <option value="payroll">Payroll</option>
                    <option value="benefits">Benefits</option>
                    <option value="policy">Policy</option>
                    <option value="grievance">Grievance</option>
                  </select>
                </label>

                <label className="block">
                  <span className="font-semibold text-pulse-ink">Priority *</span>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as HRRequestRow["priority"])}
                    className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="font-semibold text-pulse-ink">Subject *</span>
                <input
                  type="text"
                  required
                  placeholder="Brief summary of your inquiry..."
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                />
              </label>

              <label className="block">
                <span className="font-semibold text-pulse-ink">Description *</span>
                <textarea
                  required
                  rows={3}
                  placeholder="Provide comprehensive details for HR..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                />
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
                <Button variant="secondary" type="button" onClick={() => setShowSubmitModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createRequest.isPending}>
                  {createRequest.isPending ? "Submitting..." : "Submit Ticket"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
