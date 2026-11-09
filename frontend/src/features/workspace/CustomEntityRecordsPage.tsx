import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { Modal } from "../../shared/ui/Modal";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";
import {
  CustomFieldInputs,
  emptyCustomValues,
  formatCustomFieldDisplay,
  serializeCustomData,
  validateRequiredCustomFields,
  type CustomFieldDef,
} from "./CustomFieldInputs";
import { personName } from "./format";
import type { WorkspacePayload } from "./types";

type EntityRow = {
  id: string;
  key: string;
  name: string;
  description: string;
};

type RecordRow = {
  id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15";

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "The request failed.";
}

function recordTitle(row: RecordRow, defs: CustomFieldDef[], primaryKey: string) {
  if (primaryKey && row.data[primaryKey] != null && String(row.data[primaryKey]).trim()) {
    return String(row.data[primaryKey]);
  }
  const first = defs[0];
  if (first) {
    const display = formatCustomFieldDisplay(first, row.data[first.key]);
    if (display && display !== "—") return display;
  }
  return "Untitled record";
}

export function CustomEntityRecordsPage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const { entityId = "" } = useParams();
  const companyId = workspace.company.id;
  const canCreate = workspace.permissions.includes("custom_entities.create");
  const canUpdate = workspace.permissions.includes("custom_entities.update");
  const canDelete = workspace.permissions.includes("custom_entities.delete");
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [viewing, setViewing] = useState<RecordRow | null>(null);
  const [draftId, setDraftId] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [formError, setFormError] = useState("");

  const entity = useQuery({
    queryKey: ["custom-entity", companyId, entityId],
    queryFn: () => api<EntityRow>(`/api/v1/companies/${companyId}/custom-entities/${entityId}/`),
    enabled: Boolean(companyId && entityId),
  });
  const fields = useQuery({
    queryKey: ["custom-entity-fields", companyId, entityId],
    queryFn: () =>
      api<{ results: CustomFieldDef[] }>(`/api/v1/companies/${companyId}/custom-entities/${entityId}/fields/`),
    enabled: Boolean(companyId && entityId),
  });
  const records = useQuery({
    queryKey: ["custom-entity-records", companyId, entityId, q, page],
    queryFn: () =>
      api<{ results: RecordRow[]; count: number; page: number; page_size: number }>(
        `/api/v1/companies/${companyId}/custom-entities/${entityId}/records/?q=${encodeURIComponent(q)}&page=${page}`,
      ),
    enabled: Boolean(companyId && entityId),
  });

  const defs = fields.data?.results ?? [];
  const needsPeople = defs.some((def) => def.field_type === "reference" && def.config?.target === "person");
  const needsUnits = defs.some((def) => def.field_type === "reference" && def.config?.target === "organization_unit");
  const needsRoles = defs.some((def) => def.field_type === "reference" && def.config?.target === "role");
  const linkedEntityIds = useMemo(
    () =>
      [
        ...new Set(
          defs
            .filter((def) => def.field_type === "reference" && def.config?.target === "custom_entity" && def.config.entity_id)
            .map((def) => String(def.config!.entity_id)),
        ),
      ],
    [defs],
  );

  const people = useQuery({
    queryKey: ["people", companyId],
    queryFn: () =>
      api<{
        results: Array<{ person_id: string | null; first_name: string; last_name: string; email: string }>;
      }>(`/api/v1/companies/${companyId}/people/`),
    enabled: Boolean(companyId) && needsPeople,
  });
  const units = useQuery({
    queryKey: ["organization", companyId],
    queryFn: () =>
      api<{ units: Array<{ id: string; name: string }> }>(`/api/v1/companies/${companyId}/organization/units/`),
    enabled: Boolean(companyId) && needsUnits,
  });
  const roles = useQuery({
    queryKey: ["roles", companyId],
    queryFn: () => api<{ results: Array<{ id: string; name: string }> }>(`/api/v1/companies/${companyId}/roles/`),
    enabled: Boolean(companyId) && needsRoles,
  });
  const linkedRecords = useQuery({
    queryKey: ["custom-entity-ref-labels", companyId, linkedEntityIds.join(",")],
    queryFn: async () => {
      const maps: Record<string, string> = {};
      await Promise.all(
        linkedEntityIds.map(async (id) => {
          const payload = await api<{ results: Array<{ id: string; data: Record<string, unknown> }> }>(
            `/api/v1/companies/${companyId}/custom-entities/${id}/records/?page_size=100`,
          );
          for (const row of payload.results) {
            const label =
              Object.values(row.data || {}).find((value) => typeof value === "string" && value.trim()) ?? row.id;
            maps[row.id] = String(label);
          }
        }),
      );
      return maps;
    },
    enabled: Boolean(companyId) && linkedEntityIds.length > 0,
  });

  const labelsById = useMemo(() => {
    const map: Record<string, string> = { ...(linkedRecords.data ?? {}) };
    for (const row of people.data?.results ?? []) {
      if (row.person_id) map[row.person_id] = personName(row.first_name, row.last_name, row.email);
    }
    for (const unit of units.data?.units ?? []) map[unit.id] = unit.name;
    for (const role of roles.data?.results ?? []) map[role.id] = role.name;
    return map;
  }, [linkedRecords.data, people.data, units.data, roles.data]);

  const primaryKey = useMemo(() => {
    const marked = defs.find((item) => (item as CustomFieldDef & { is_primary?: boolean }).is_primary);
    return marked?.key ?? defs.find((item) => item.field_type === "text")?.key ?? defs[0]?.key ?? "";
  }, [defs]);

  const previewDefs = useMemo(() => {
    const rest = defs.filter((def) => def.key !== primaryKey);
    return rest.slice(0, 3);
  }, [defs, primaryKey]);

  const save = useMutation({
    mutationFn: () => {
      const body = { data: serializeCustomData(defs, values) };
      if (draftId) {
        return api<RecordRow>(`/api/v1/companies/${companyId}/custom-entities/${entityId}/records/${draftId}/`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      return api<RecordRow>(`/api/v1/companies/${companyId}/custom-entities/${entityId}/records/`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: async (saved) => {
      setEditorOpen(false);
      setFormError("");
      if (viewing?.id === saved.id) setViewing(saved);
      await queryClient.invalidateQueries({ queryKey: ["custom-entity-records", companyId, entityId] });
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/api/v1/companies/${companyId}/custom-entities/${entityId}/records/${id}/`, { method: "DELETE" }),
    onSuccess: async (_data, id) => {
      if (viewing?.id === id) setViewing(null);
      await queryClient.invalidateQueries({ queryKey: ["custom-entity-records", companyId, entityId] });
    },
  });

  function openCreate() {
    setDraftId("");
    setValues(emptyCustomValues(defs));
    setFormError("");
    setEditorOpen(true);
  }

  function openEdit(row: RecordRow) {
    setDraftId(row.id);
    setValues(emptyCustomValues(defs, row.data));
    setFormError("");
    setEditorOpen(true);
  }

  function openView(row: RecordRow) {
    setViewing(row);
  }

  if (entity.isLoading || fields.isLoading) return <LoadingState label="Loading records" />;
  if (entity.isError || !entity.data) {
return <ErrorState title="Entity unavailable" body={errorMessage(entity.error)} />;  }

  const rows = records.data?.results ?? [];
  const count = records.data?.count ?? 0;
  const pageSize = records.data?.page_size ?? 20;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const viewingTitle = viewing ? recordTitle(viewing, defs, primaryKey) : "";

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Breadcrumbs items={["Workspace", "Custom Records", entity.data.name]} />
          <p className="mt-2 text-sm text-pulse-muted">
            <Link to="/app/custom-entities" className="text-pulse-accent hover:underline">
              All entities
            </Link>
            <span className="mx-1 text-pulse-muted/60">·</span>
            <Link to="/app/settings?section=custom-entities" className="hover:text-pulse-accent">
              Manage fields
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-pulse-ink">{entity.data.name}</h1>
          <p className="mt-1 text-sm text-pulse-muted">
            {entity.data.description || "Company-scoped custom records."}
            {count ? <span className="ml-2 text-pulse-muted/80">· {count} records</span> : null}
          </p>
        </div>
        {canCreate ? (
          <Button type="button" onClick={openCreate} disabled={defs.length === 0}>
            Add record
          </Button>
        ) : null}
      </div>

      {defs.length === 0 ? (
       <EmptyState
  title="No fields defined"
  body="Add fields for this entity in Configuration before creating records."
/>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative block max-w-sm flex-1">
              <span className="sr-only">Search records</span>
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-pulse-muted">
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                  <circle cx="8.5" cy="8.5" r="5" />
                  <path d="m12.5 12.5 4 4" />
                </svg>
              </span>
              <input
                className={`${fieldClass} pl-9`}
                placeholder={`Search ${entity.data.name.toLowerCase()}…`}
                value={q}
                onChange={(event) => {
                  setQ(event.target.value);
                  setPage(1);
                }}
              />
            </label>
          </div>

          {records.isLoading ? <LoadingState label="Loading records" /> : null}
{records.isError ? <ErrorState title="Could not load records" body={errorMessage(records.error)} /> : null}          {!records.isLoading && !records.isError && rows.length === 0 ? (
         <EmptyState
  title={q.trim() ? "No matching records" : "No records yet"}
  body={q.trim() ? "Try a different search." : "Create the first record for this entity."}
/>
          ) : null}

          {rows.length ? (
            <div className="overflow-hidden rounded-xl border border-pulse-border bg-pulse-surface">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-pulse-border bg-pulse-hover/40 text-xs uppercase tracking-wide text-pulse-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Record</th>
                    {previewDefs.map((def) => (
                      <th key={def.id} className="hidden px-4 py-3 font-semibold md:table-cell">
                        {def.name}
                      </th>
                    ))}
                    <th className="hidden px-4 py-3 font-semibold sm:table-cell">Created</th>
                    <th className="px-4 py-3 font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const title = recordTitle(row, defs, primaryKey);
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-pulse-border last:border-0 hover:bg-pulse-hover/30"
                      >
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="text-left font-medium text-pulse-accent hover:underline"
                            onClick={() => openView(row)}
                          >
                            {title}
                          </button>
                        </td>
                        {previewDefs.map((def) => (
                          <td key={def.id} className="hidden max-w-[12rem] truncate px-4 py-3 text-pulse-muted md:table-cell">
                            {formatCustomFieldDisplay(def, row.data[def.key], labelsById)}
                          </td>
                        ))}
                        <td className="hidden whitespace-nowrap px-4 py-3 text-pulse-muted sm:table-cell">
                          {new Date(row.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex flex-wrap justify-end gap-2">
                            <Button type="button" variant="secondary" onClick={() => openView(row)}>
                              View
                            </Button>
                            {canUpdate ? (
                              <Button type="button" variant="secondary" onClick={() => openEdit(row)}>
                                Edit
                              </Button>
                            ) : null}
                            {canDelete ? (
                              <ConfirmDialog
                                title="Archive this record?"
                                body="The record will be hidden from lists."
                                confirmLabel={remove.isPending ? "Archiving…" : "Archive"}
                                trigger={
                                  <Button type="button" variant="secondary">
                                    Archive
                                  </Button>
                                }
                                onConfirm={() => remove.mutate(row.id)}
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between text-sm text-pulse-muted">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewingTitle || "Record"}
        description={`${entity.data.name} · full record`}
        wide
        footer={
          viewing ? (
            <>
              <Button type="button" variant="secondary" onClick={() => setViewing(null)}>
                Close
              </Button>
              {canUpdate ? (
                <Button
                  type="button"
                  onClick={() => {
                    openEdit(viewing);
                  }}
                >
                  Edit
                </Button>
              ) : null}
              {canDelete ? (
                <ConfirmDialog
                  title="Archive this record?"
                  body="The record will be hidden from lists."
                  confirmLabel={remove.isPending ? "Archiving…" : "Archive"}
                  trigger={
                    <Button type="button" variant="secondary">
                      Archive
                    </Button>
                  }
                  onConfirm={() => remove.mutate(viewing.id)}
                />
              ) : null}
            </>
          ) : null
        }
      >
        {viewing ? (
          <div className="space-y-4">
            <dl className="divide-y divide-pulse-border rounded-xl border border-pulse-border">
              {defs.map((def) => (
                <div key={def.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-pulse-muted">{def.name}</dt>
                  <dd className="whitespace-pre-wrap text-sm text-pulse-ink">
                    {formatCustomFieldDisplay(def, viewing.data[def.key], labelsById)}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="grid gap-2 rounded-xl border border-pulse-border bg-pulse-hover/30 px-4 py-3 text-xs text-pulse-muted sm:grid-cols-2">
              <p>
                <span className="font-medium text-pulse-ink">Created</span>
                <br />
                {new Date(viewing.created_at).toLocaleString()}
              </p>
              <p>
                <span className="font-medium text-pulse-ink">Updated</span>
                <br />
                {viewing.updated_at ? new Date(viewing.updated_at).toLocaleString() : "—"}
              </p>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={draftId ? "Edit record" : "Add record"}
        description={entity.data.name}
        wide
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const requiredError = validateRequiredCustomFields(defs, values);
            if (requiredError) {
              setFormError(requiredError);
              return;
            }
            save.mutate();
          }}
        >
          {formError ? <p className="text-sm text-rose-700">{formError}</p> : null}
          <CustomFieldInputs companyId={companyId} defs={defs} values={values} onChange={setValues} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
