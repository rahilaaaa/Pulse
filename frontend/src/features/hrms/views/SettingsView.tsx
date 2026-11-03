import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError } from "../../../shared/api/client";
import { Button } from "../../../shared/ui/Button";
import type {
  Activation,
  DesignationRow,
  LegalEntityRow,
  ShiftRow,
  WorkLocationRow,
} from "../types";

const panelClass = "rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-sm";

function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : "The request could not be completed.";
}

interface SettingsViewProps {
  companyId: string;
  activation: Activation | undefined;
  onRefreshActivation: () => void;
}

export function SettingsView({
  companyId,
  activation,
  onRefreshActivation,
}: SettingsViewProps) {
  const queryClient = useQueryClient();
  const root = `/api/v1/companies/${companyId}/hrms`;

  type SettingsTab = "activation" | "entities" | "locations" | "designations" | "shifts";
  const [activeTab, setActiveTab] = useState<SettingsTab>("activation");
  const [feedback, setFeedback] = useState<string | null>(null);

  // Modals
  const [showEntityModal, setShowEntityModal] = useState(false);
  const [entityName, setEntityName] = useState("");
  const [entityCode, setEntityCode] = useState("");

  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locName, setLocName] = useState("");
  const [locCode, setLocCode] = useState("");
  const [locTimezone, setLocTimezone] = useState("Asia/Kolkata");
  const [locAddress, setLocAddress] = useState("");

  const [showDesignationModal, setShowDesignationModal] = useState(false);
  const [desigName, setDesigName] = useState("");
  const [desigCode, setDesigCode] = useState("");
  const [desigDesc, setDesigDesc] = useState("");

  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftName, setShiftName] = useState("");
  const [shiftCode, setShiftCode] = useState("");
  const [shiftStart, setShiftStart] = useState("09:00");
  const [shiftEnd, setShiftEnd] = useState("18:00");

  // Queries
  const legalEntities = useQuery({
    queryKey: ["hrms-legal-entities", companyId],
    queryFn: () => api<{ results: LegalEntityRow[] }>(`${root}/legal-entities/`),
  });

  const workLocations = useQuery({
    queryKey: ["hrms-work-locations", companyId],
    queryFn: () => api<{ results: WorkLocationRow[] }>(`${root}/work-locations/`),
  });

  const designations = useQuery({
    queryKey: ["hrms-designations", companyId],
    queryFn: () => api<{ results: DesignationRow[] }>(`${root}/designations/`),
  });

  const shifts = useQuery({
    queryKey: ["hrms-shifts", companyId],
    queryFn: () => api<{ results: ShiftRow[] }>(`${root}/shifts/`),
  });

  // Mutations
  const activateFeature = useMutation({
    mutationFn: (feature: "employee_leave" | "attendance" | "payroll") =>
      api(`${root}/activation/`, {
        method: "POST",
        body: JSON.stringify({ feature }),
      }),
    onSuccess: async (_, feature) => {
      setFeedback(`Feature '${feature.replace("_", " ")}' activated successfully.`);
      await queryClient.invalidateQueries({ queryKey: ["hrms-activation", companyId] });
      onRefreshActivation();
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const createEntity = useMutation({
    mutationFn: () =>
      api(`${root}/legal-entities/`, {
        method: "POST",
        body: JSON.stringify({ name: entityName, code: entityCode }),
      }),
    onSuccess: async () => {
      setFeedback("Legal entity registered.");
      setShowEntityModal(false);
      setEntityName("");
      setEntityCode("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-legal-entities", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const createLocation = useMutation({
    mutationFn: () =>
      api(`${root}/work-locations/`, {
        method: "POST",
        body: JSON.stringify({
          name: locName,
          code: locCode,
          timezone: locTimezone,
          address: locAddress,
        }),
      }),
    onSuccess: async () => {
      setFeedback("Work location registered.");
      setShowLocationModal(false);
      setLocName("");
      setLocCode("");
      setLocAddress("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-work-locations", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const createDesignation = useMutation({
    mutationFn: () =>
      api(`${root}/designations/`, {
        method: "POST",
        body: JSON.stringify({
          name: desigName,
          code: desigCode,
          description: desigDesc,
        }),
      }),
    onSuccess: async () => {
      setFeedback("Designation role registered.");
      setShowDesignationModal(false);
      setDesigName("");
      setDesigCode("");
      setDesigDesc("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-designations", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const createShift = useMutation({
    mutationFn: () =>
      api(`${root}/shifts/`, {
        method: "POST",
        body: JSON.stringify({
          name: shiftName,
          code: shiftCode,
          start_time: shiftStart,
          end_time: shiftEnd,
          grace_period_minutes: 15,
        }),
      }),
    onSuccess: async () => {
      setFeedback("Work shift registered.");
      setShowShiftModal(false);
      setShiftName("");
      setShiftCode("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-shifts", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const readiness = activation?.readiness;

  return (
    <div className="space-y-4">
      {/* Feedback banner */}
      {feedback && (
        <div className="flex items-center justify-between rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Header and Sub-Tabs */}
      <section className={panelClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-pulse-ink">HRMS Settings & Master Data</h2>
            <p className="text-xs text-pulse-muted">
              Configure organizational units, legal entities, locations, designations, shifts, and feature activations.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-pulse-border pt-3 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("activation")}
            className={`rounded-md px-3 py-1.5 font-semibold transition ${
              activeTab === "activation"
                ? "bg-pulse-accent text-white shadow-sm"
                : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            Feature Activation & Readiness
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("entities")}
            className={`rounded-md px-3 py-1.5 font-semibold transition ${
              activeTab === "entities"
                ? "bg-pulse-accent text-white shadow-sm"
                : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            Legal Entities
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("locations")}
            className={`rounded-md px-3 py-1.5 font-semibold transition ${
              activeTab === "locations"
                ? "bg-pulse-accent text-white shadow-sm"
                : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            Work Locations
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("designations")}
            className={`rounded-md px-3 py-1.5 font-semibold transition ${
              activeTab === "designations"
                ? "bg-pulse-accent text-white shadow-sm"
                : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            Designations
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("shifts")}
            className={`rounded-md px-3 py-1.5 font-semibold transition ${
              activeTab === "shifts"
                ? "bg-pulse-accent text-white shadow-sm"
                : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            Shifts & Schedules
          </button>
        </div>
      </section>

      {/* SUB-TAB 1: Feature Activation & Readiness */}
      {activeTab === "activation" && (
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Leave Feature */}
          <div className={panelClass}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-pulse-ink">Employee Leave</span>
              <span
                className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${
                  readiness?.employee_leave?.activated
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                }`}
              >
                {readiness?.employee_leave?.activated ? "Active" : "Ready"}
              </span>
            </div>
            <p className="mt-2 text-xs text-pulse-muted">
              Leave policies, request workflows, and supervisor approval routing.
            </p>
            <div className="mt-4">
              <Button
                size="sm"
                variant={readiness?.employee_leave?.activated ? "secondary" : "primary"}
                className="w-full"
                disabled={activateFeature.isPending || readiness?.employee_leave?.activated}
                onClick={() => activateFeature.mutate("employee_leave")}
              >
                {readiness?.employee_leave?.activated ? "✓ Activated" : "Activate Leave Feature"}
              </Button>
            </div>
          </div>

          {/* Attendance Feature */}
          <div className={panelClass}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-pulse-ink">Attendance & Shifts</span>
              <span
                className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${
                  readiness?.attendance?.activated
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                {readiness?.attendance?.activated ? "Active" : readiness?.attendance?.ready ? "Ready" : "Pending Setup"}
              </span>
            </div>
            <p className="mt-2 text-xs text-pulse-muted">
              {readiness?.attendance?.reason || "Daily check-in / check-out, geofence, and roster tracking."}
            </p>
            <div className="mt-4">
              <Button
                size="sm"
                variant={readiness?.attendance?.activated ? "secondary" : "primary"}
                className="w-full"
                disabled={activateFeature.isPending || !readiness?.attendance?.ready || readiness?.attendance?.activated}
                onClick={() => activateFeature.mutate("attendance")}
              >
                {readiness?.attendance?.activated ? "✓ Activated" : "Activate Attendance"}
              </Button>
            </div>
          </div>

          {/* Payroll Feature */}
          <div className={panelClass}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-pulse-ink">Payroll Engine</span>
              <span
                className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${
                  readiness?.payroll?.activated
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                {readiness?.payroll?.activated ? "Active" : readiness?.payroll?.ready ? "Ready" : "Pending Setup"}
              </span>
            </div>
            <p className="mt-2 text-xs text-pulse-muted">
              {readiness?.payroll?.reasons?.[0] || "Salary structures, compensation rules, and maker-checker approval runs."}
            </p>
            <div className="mt-4">
              <Button
                size="sm"
                variant={readiness?.payroll?.activated ? "secondary" : "primary"}
                className="w-full"
                disabled={activateFeature.isPending || !readiness?.payroll?.ready || readiness?.payroll?.activated}
                onClick={() => activateFeature.mutate("payroll")}
              >
                {readiness?.payroll?.activated ? "✓ Activated" : "Activate Payroll"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: Legal Entities */}
      {activeTab === "entities" && (
        <section className={`${panelClass} overflow-hidden p-0`}>
          <div className="p-4 border-b border-pulse-border flex items-center justify-between">
            <h3 className="text-base font-bold text-pulse-ink">Registered Legal Entities</h3>
            <Button size="sm" onClick={() => setShowEntityModal(true)}>
              + Add Legal Entity
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-pulse-border bg-pulse-hover/50 text-pulse-muted">
                  <th className="px-4 py-2.5 font-semibold">Entity Name</th>
                  <th className="px-4 py-2.5 font-semibold">Code Slug</th>
                  <th className="px-4 py-2.5 font-semibold">Country</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pulse-border">
                {(legalEntities.data?.results ?? []).map((ent) => (
                  <tr key={ent.id} className="hover:bg-pulse-hover/60">
                    <td className="px-4 py-2.5 font-semibold text-pulse-ink">{ent.name}</td>
                    <td className="px-4 py-2.5 font-mono text-pulse-muted">{ent.code}</td>
                    <td className="px-4 py-2.5 text-pulse-muted">{ent.country || "IN"}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold">
                        {ent.status || "active"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SUB-TAB 3: Work Locations */}
      {activeTab === "locations" && (
        <section className={`${panelClass} overflow-hidden p-0`}>
          <div className="p-4 border-b border-pulse-border flex items-center justify-between">
            <h3 className="text-base font-bold text-pulse-ink">Work Locations & Offices</h3>
            <Button size="sm" onClick={() => setShowLocationModal(true)}>
              + Add Work Location
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-pulse-border bg-pulse-hover/50 text-pulse-muted">
                  <th className="px-4 py-2.5 font-semibold">Location Name</th>
                  <th className="px-4 py-2.5 font-semibold">Code</th>
                  <th className="px-4 py-2.5 font-semibold">Timezone</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pulse-border">
                {(workLocations.data?.results ?? []).map((loc) => (
                  <tr key={loc.id} className="hover:bg-pulse-hover/60">
                    <td className="px-4 py-2.5 font-semibold text-pulse-ink">{loc.name}</td>
                    <td className="px-4 py-2.5 font-mono text-pulse-muted">{loc.code}</td>
                    <td className="px-4 py-2.5 font-mono text-pulse-muted">{loc.timezone || "Asia/Kolkata"}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold">
                        Active
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SUB-TAB 4: Designations */}
      {activeTab === "designations" && (
        <section className={`${panelClass} overflow-hidden p-0`}>
          <div className="p-4 border-b border-pulse-border flex items-center justify-between">
            <h3 className="text-base font-bold text-pulse-ink">Designation Catalog</h3>
            <Button size="sm" onClick={() => setShowDesignationModal(true)}>
              + Add Designation
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-pulse-border bg-pulse-hover/50 text-pulse-muted">
                  <th className="px-4 py-2.5 font-semibold">Designation Title</th>
                  <th className="px-4 py-2.5 font-semibold">Code</th>
                  <th className="px-4 py-2.5 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pulse-border">
                {(designations.data?.results ?? []).map((d) => (
                  <tr key={d.id} className="hover:bg-pulse-hover/60">
                    <td className="px-4 py-2.5 font-semibold text-pulse-ink">{d.name}</td>
                    <td className="px-4 py-2.5 font-mono text-pulse-muted">{d.code}</td>
                    <td className="px-4 py-2.5 text-pulse-muted">{d.description || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SUB-TAB 5: Shifts */}
      {activeTab === "shifts" && (
        <section className={`${panelClass} overflow-hidden p-0`}>
          <div className="p-4 border-b border-pulse-border flex items-center justify-between">
            <h3 className="text-base font-bold text-pulse-ink">Work Shifts & Timing</h3>
            <Button size="sm" onClick={() => setShowShiftModal(true)}>
              + Add Work Shift
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-pulse-border bg-pulse-hover/50 text-pulse-muted">
                  <th className="px-4 py-2.5 font-semibold">Shift Name</th>
                  <th className="px-4 py-2.5 font-semibold">Code</th>
                  <th className="px-4 py-2.5 font-semibold">Timing</th>
                  <th className="px-4 py-2.5 font-semibold">Grace Period</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pulse-border">
                {(shifts.data?.results ?? []).map((sh) => (
                  <tr key={sh.id} className="hover:bg-pulse-hover/60">
                    <td className="px-4 py-2.5 font-semibold text-pulse-ink">{sh.name}</td>
                    <td className="px-4 py-2.5 font-mono text-pulse-muted">{sh.code}</td>
                    <td className="px-4 py-2.5 font-mono text-pulse-ink font-medium">
                      {sh.start_time} - {sh.end_time}
                    </td>
                    <td className="px-4 py-2.5 text-pulse-muted font-mono">{sh.grace_period_minutes ?? 15} mins</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Add Entity Modal */}
      {showEntityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-pulse-ink">Add Legal Entity</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createEntity.mutate();
              }}
              className="space-y-3 text-xs"
            >
              <label className="block">
                <span className="font-semibold text-pulse-ink">Entity Legal Name *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. TechNewWings Pvt Ltd"
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                />
              </label>
              <label className="block">
                <span className="font-semibold text-pulse-ink">Code Slug *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. technewwings-in"
                  value={entityCode}
                  onChange={(e) => setEntityCode(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink font-mono"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
                <Button variant="secondary" type="button" onClick={() => setShowEntityModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createEntity.isPending}>
                  Create Entity
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Location Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-pulse-ink">Add Work Location</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createLocation.mutate();
              }}
              className="space-y-3 text-xs"
            >
              <label className="block">
                <span className="font-semibold text-pulse-ink">Location Name *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Headquarters"
                  value={locName}
                  onChange={(e) => setLocName(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                />
              </label>
              <label className="block">
                <span className="font-semibold text-pulse-ink">Code Slug *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. hq-blr"
                  value={locCode}
                  onChange={(e) => setLocCode(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink font-mono"
                />
              </label>
              <label className="block">
                <span className="font-semibold text-pulse-ink">Timezone</span>
                <input
                  type="text"
                  value={locTimezone}
                  onChange={(e) => setLocTimezone(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink font-mono"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
                <Button variant="secondary" type="button" onClick={() => setShowLocationModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createLocation.isPending}>
                  Save Location
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Designation Modal */}
      {showDesignationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-pulse-ink">Add Designation</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createDesignation.mutate();
              }}
              className="space-y-3 text-xs"
            >
              <label className="block">
                <span className="font-semibold text-pulse-ink">Title *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lead Architect"
                  value={desigName}
                  onChange={(e) => setDesigName(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                />
              </label>
              <label className="block">
                <span className="font-semibold text-pulse-ink">Code Slug *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. lead-arch"
                  value={desigCode}
                  onChange={(e) => setDesigCode(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink font-mono"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
                <Button variant="secondary" type="button" onClick={() => setShowDesignationModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createDesignation.isPending}>
                  Save Designation
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Shift Modal */}
      {showShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-pulse-ink">Add Work Shift</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createShift.mutate();
              }}
              className="space-y-3 text-xs"
            >
              <label className="block">
                <span className="font-semibold text-pulse-ink">Shift Name *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Standard Morning"
                  value={shiftName}
                  onChange={(e) => setShiftName(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                />
              </label>
              <label className="block">
                <span className="font-semibold text-pulse-ink">Code Slug *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. std-morning"
                  value={shiftCode}
                  onChange={(e) => setShiftCode(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink font-mono"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="font-semibold text-pulse-ink">Start Time</span>
                  <input
                    type="time"
                    value={shiftStart}
                    onChange={(e) => setShiftStart(e.target.value)}
                    className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink font-mono"
                  />
                </label>
                <label className="block">
                  <span className="font-semibold text-pulse-ink">End Time</span>
                  <input
                    type="time"
                    value={shiftEnd}
                    onChange={(e) => setShiftEnd(e.target.value)}
                    className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink font-mono"
                  />
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
                <Button variant="secondary" type="button" onClick={() => setShowShiftModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createShift.isPending}>
                  Save Shift
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
