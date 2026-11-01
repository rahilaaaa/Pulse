import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { Modal } from "../../shared/ui/Modal";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";
import {
  emptyValidation,
  FieldValidationFields,
  supportsFieldValidation,
  validationFromConfig,
  validationPayload,
  type FieldValidationConfig,
  type ValidationDraft,
} from "./FieldValidationDraft";

type EntityRow = {
  id: string;
  key: string;
  name: string;
  description: string;
  status: string;
  schema_version: number;
};

type FieldRow = {
  id: string;
  name: string;
  key: string;
  field_type: string;
  help_text: string;
  required: boolean;
  sensitive: boolean;
  filterable: boolean;
  is_primary: boolean;
  options: string[];
  config?: {
    target?: string;
    multiple?: boolean;
    entity_id?: string;
    validation?: FieldValidationConfig;
  };
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink outline-none transition placeholder:text-pulse-muted focus:border-pulse-accent focus:ring-2 focus:ring-[var(--pulse-ring)] disabled:opacity-55";
const cardClass = "rounded-xl border border-pulse-border bg-pulse-surface shadow-sm";

const TYPES = [
  { id: "text", label: "Text" },
  { id: "long_text", label: "Long text" },
  { id: "number", label: "Number" },
  { id: "date", label: "Date" },
  { id: "boolean", label: "Boolean" },
  { id: "select", label: "Select" },
  { id: "multi_select", label: "Multi-select" },
  { id: "reference", label: "Link" },
  { id: "email", label: "Email" },
  { id: "url", label: "URL" },
  { id: "phone", label: "Phone" },
];

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "The request failed.";
}

function linkConfigFromDraft(linkTarget: string, linkMultiple: boolean) {
  if (linkTarget.startsWith("custom_entity:")) {
    return { target: "custom_entity", entity_id: linkTarget.slice("custom_entity:".length), multiple: linkMultiple };
  }
  return { target: linkTarget || "role", multiple: linkMultiple };
}

export function CustomEntitiesSection({
  companyId,
  canManage,
}: {
  companyId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [entityOpen, setEntityOpen] = useState(false);
  const [entityDraft, setEntityDraft] = useState({ name: "", description: "" });
  const [entityError, setEntityError] = useState("");
  const [fieldOpen, setFieldOpen] = useState(false);
  const [fieldDraft, setFieldDraft] = useState<{
    id: string;
    name: string;
    field_type: string;
    help_text: string;
    options: string;
    linkTarget: string;
    linkMultiple: boolean;
    required: boolean;
    sensitive: boolean;
    filterable: boolean;
    is_primary: boolean;
    validation: ValidationDraft;
  }>({
    id: "",
    name: "",
    field_type: "text",
    help_text: "",
    options: "",
    linkTarget: "role",
    linkMultiple: true,
    required: false,
    sensitive: false,
    filterable: false,
    is_primary: false,
    validation: emptyValidation("text"),
  });
  const [fieldError, setFieldError] = useState("");
  const entities = useQuery({
    queryKey: ["custom-entities", companyId],
    queryFn: () => api<{ results: EntityRow[] }>(`/api/v1/companies/${companyId}/custom-entities/`),
  });
  const fields = useQuery({
    queryKey: ["custom-entity-fields", companyId, selectedId],
    queryFn: () =>
      api<{ results: FieldRow[] }>(`/api/v1/companies/${companyId}/custom-entities/${selectedId}/fields/`),
    enabled: Boolean(selectedId),
  });
  const referenceTargets = useQuery({
    queryKey: ["custom-fields", companyId, "reference-targets"],
    queryFn: () =>
      api<{ results: Array<{ id: string; label: string }> }>(
        `/api/v1/companies/${companyId}/custom-fields/reference-targets/`,
      ),
    enabled: fieldOpen,
  });

  useEffect(() => {
    const rows = entities.data?.results ?? [];
    if (!selectedId && rows.length) setSelectedId(rows[0].id);
    if (selectedId && rows.length && !rows.some((row) => row.id === selectedId)) {
      setSelectedId(rows[0]?.id ?? "");
    }
  }, [entities.data, selectedId]);

  const selected = (entities.data?.results ?? []).find((row) => row.id === selectedId) ?? null;

  const saveEntity = useMutation({
    mutationFn: () =>
      api<EntityRow>(`/api/v1/companies/${companyId}/custom-entities/`, {
        method: "POST",
        body: JSON.stringify({ name: entityDraft.name, description: entityDraft.description }),
      }),
    onSuccess: async (row) => {
      setEntityOpen(false);
      setEntityError("");
      await queryClient.invalidateQueries({ queryKey: ["custom-entities", companyId] });
      setSelectedId(row.id);
    },
    onError: (error) => setEntityError(errorMessage(error)),
  });

  const archiveEntity = useMutation({
    mutationFn: (id: string) => api(`/api/v1/companies/${companyId}/custom-entities/${id}/`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["custom-entities", companyId] });
    },
  });

  const saveField = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name: fieldDraft.name,
        help_text: fieldDraft.help_text,
        required: fieldDraft.required,
        sensitive: fieldDraft.sensitive,
        filterable: fieldDraft.filterable,
        is_primary: fieldDraft.is_primary,
        options:
          fieldDraft.field_type === "select" || fieldDraft.field_type === "multi_select"
            ? fieldDraft.options
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean)
            : [],
      };
      if (!fieldDraft.id) body.field_type = fieldDraft.field_type;
      if (fieldDraft.field_type === "reference") {
        body.config = linkConfigFromDraft(fieldDraft.linkTarget, fieldDraft.linkMultiple);
      } else if (supportsFieldValidation(fieldDraft.field_type)) {
        const rules = validationPayload(fieldDraft.field_type, fieldDraft.validation);
        body.validation = rules ?? {};
      }
      if (fieldDraft.id) {
        return api<FieldRow>(`/api/v1/companies/${companyId}/custom-entities/${selectedId}/fields/${fieldDraft.id}/`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      return api<FieldRow>(`/api/v1/companies/${companyId}/custom-entities/${selectedId}/fields/`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: async () => {
      setFieldOpen(false);
      setFieldError("");
      await queryClient.invalidateQueries({ queryKey: ["custom-entity-fields", companyId, selectedId] });
    },
    onError: (error) => setFieldError(errorMessage(error)),
  });

  const archiveField = useMutation({
    mutationFn: (id: string) =>
      api(`/api/v1/companies/${companyId}/custom-entities/${selectedId}/fields/${id}/`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["custom-entity-fields", companyId, selectedId] });
    },
  });

  if (entities.isLoading) return <LoadingState label="Loading custom entities" />;
if (entities.isError) {
  return <ErrorState title="Could not load custom entities" body={errorMessage(entities.error)} />;
}
  const rows = entities.data?.results ?? [];
  const fieldRows = fields.data?.results ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-pulse-ink">Custom Entities</h2>
          <p className="mt-1 text-sm text-pulse-muted">
            Define company-scoped record types with their own fields. API keys are immutable after create.
          </p>
        </div>
        {canManage ? (
          <Button
            type="button"
            onClick={() => {
              setEntityDraft({ name: "", description: "" });
              setEntityError("");
              setEntityOpen(true);
            }}
          >
            Add entity
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
<EmptyState
  title="No custom entities yet"
  body="Create an entity such as Queue to store company-specific records."
/>      ) : (
        <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
          <div className={`${cardClass} p-2`}>
            <ul className="space-y-0.5">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm ${
                      selectedId === row.id ? "bg-pulse-accent-tint text-pulse-ink" : "text-pulse-muted hover:bg-pulse-hover"
                    }`}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <span className="font-medium">{row.name}</span>
                    <span className="font-mono text-[11px] text-pulse-muted">{row.key}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {selected ? (
            <div className="space-y-4">
              <div className={`${cardClass} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-pulse-ink">{selected.name}</h3>
                    <p className="mt-1 text-sm text-pulse-muted">{selected.description || "No description."}</p>
                    <p className="mt-2 font-mono text-xs text-pulse-muted">
                      key={selected.key} · schema v{selected.schema_version}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to={`/app/custom-entities/${selected.id}`}
                      className="rounded-lg border border-pulse-border px-3 py-1.5 text-sm text-pulse-ink hover:bg-pulse-hover"
                    >
                      Open records
                    </Link>
                    {canManage ? (
                      <ConfirmDialog
                        title="Archive this entity?"
                        body="New records will be blocked. Existing records remain readable."
                        confirmLabel={archiveEntity.isPending ? "Archiving…" : "Archive"}
                        trigger={
                          <Button type="button" variant="secondary">
                            Archive
                          </Button>
                        }
                        onConfirm={() => archiveEntity.mutate(selected.id)}
                      />
                    ) : null}
                  </div>
                </div>
              </div>

              <div className={`${cardClass} p-4`}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-pulse-ink">Fields</h4>
                  {canManage ? (
                    <Button
                      type="button"
                      onClick={() => {
                        setFieldDraft({
                          id: "",
                          name: "",
                          field_type: "text",
                          help_text: "",
                          options: "",
                          linkTarget: "role",
                          linkMultiple: true,
                          required: false,
                          sensitive: false,
                          filterable: false,
                          is_primary: false,
                          validation: emptyValidation("text"),
                        });
                        setFieldError("");
                        setFieldOpen(true);
                      }}
                    >
                      Add field
                    </Button>
                  ) : null}
                </div>
                {fields.isLoading ? <LoadingState label="Loading fields" /> : null}
                {!fields.isLoading && fieldRows.length === 0 ? (
<EmptyState
  title="No fields yet"
  body="Add at least one text field and mark it primary for search."
/>                ) : null}
                {fieldRows.length ? (
                  <ul className="divide-y divide-pulse-border">
                    {fieldRows.map((row) => (
                      <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                        <div>
                          <p className="text-sm font-medium text-pulse-ink">
                            {row.name}
                            {row.is_primary ? (
                              <span className="ml-2 rounded bg-pulse-hover px-1.5 py-0.5 text-[10px] uppercase text-pulse-muted">
                                Primary
                              </span>
                            ) : null}
                          </p>
                          <p className="font-mono text-xs text-pulse-muted">
                            {row.key} · {row.field_type}
                            {row.required ? " · required" : ""}
                            {row.sensitive ? " · sensitive" : ""}
                          </p>
                        </div>
                        {canManage ? (
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => {
                                setFieldDraft({
                                  id: row.id,
                                  name: row.name,
                                  field_type: row.field_type,
                                  help_text: row.help_text || "",
                                  options: (row.options || []).join("\n"),
                                  linkTarget:
                                    row.config?.target === "custom_entity" && row.config.entity_id
                                      ? `custom_entity:${row.config.entity_id}`
                                      : row.config?.target || "role",
                                  linkMultiple: row.config?.multiple !== false,
                                  required: row.required,
                                  sensitive: row.sensitive,
                                  filterable: row.filterable,
                                  is_primary: row.is_primary,
                                  validation: row.config?.validation
                                    ? validationFromConfig(row.config)
                                    : emptyValidation(row.field_type === "phone" ? "text" : row.field_type),
                                });
                                setFieldError("");
                                setFieldOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <ConfirmDialog
                              title="Archive this field?"
                              body="The field will no longer appear on forms. Existing values are kept."
                              confirmLabel={archiveField.isPending ? "Archiving…" : "Archive"}
                              trigger={
                                <Button type="button" variant="secondary">
                                  Archive
                                </Button>
                              }
                              onConfirm={() => archiveField.mutate(row.id)}
                            />
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}

      <Modal open={entityOpen} onClose={() => setEntityOpen(false)} title="Add custom entity">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!entityDraft.name.trim()) {
              setEntityError("Enter an entity name.");
              return;
            }
            saveEntity.mutate();
          }}
        >
          {entityError ? <p className="text-sm text-rose-700">{entityError}</p> : null}
          <label className="block text-sm font-medium text-pulse-ink">
            Name
            <input
              className={fieldClass}
              value={entityDraft.name}
              onChange={(event) => setEntityDraft({ ...entityDraft, name: event.target.value })}
              required
            />
          </label>
          <label className="block text-sm font-medium text-pulse-ink">
            Description
            <textarea
              className={fieldClass}
              rows={3}
              value={entityDraft.description}
              onChange={(event) => setEntityDraft({ ...entityDraft, description: event.target.value })}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEntityOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveEntity.isPending}>
              {saveEntity.isPending ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={fieldOpen}
        onClose={() => setFieldOpen(false)}
        title={fieldDraft.id ? "Edit field" : "Add field"}
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!fieldDraft.name.trim()) {
              setFieldError("Enter a field name.");
              return;
            }
            saveField.mutate();
          }}
        >
          {fieldError ? <p className="text-sm text-rose-700">{fieldError}</p> : null}
          <label className="block text-sm font-medium text-pulse-ink">
            Name
            <input
              className={fieldClass}
              value={fieldDraft.name}
              onChange={(event) => setFieldDraft({ ...fieldDraft, name: event.target.value })}
              required
            />
          </label>
          {!fieldDraft.id ? (
            <label className="block text-sm font-medium text-pulse-ink">
              Type
              <select
                className={fieldClass}
                value={fieldDraft.field_type}
                onChange={(event) => {
                  const field_type = event.target.value;
                  setFieldDraft({
                    ...fieldDraft,
                    field_type,
                    is_primary: false,
                    validation: emptyValidation(field_type),
                  });
                }}
              >
                {TYPES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="block text-sm font-medium text-pulse-ink">
            Help text
            <input
              className={fieldClass}
              value={fieldDraft.help_text}
              onChange={(event) => setFieldDraft({ ...fieldDraft, help_text: event.target.value })}
            />
          </label>
          {fieldDraft.field_type === "select" || fieldDraft.field_type === "multi_select" ? (
            <label className="block text-sm font-medium text-pulse-ink">
              Options (one per line)
              <textarea
                className={fieldClass}
                rows={4}
                value={fieldDraft.options}
                onChange={(event) => setFieldDraft({ ...fieldDraft, options: event.target.value })}
              />
            </label>
          ) : null}
          {fieldDraft.field_type === "reference" ? (
            <>
              <label className="block text-sm font-medium text-pulse-ink">
                Link target
                <select
                  className={fieldClass}
                  value={fieldDraft.linkTarget}
                  onChange={(event) => setFieldDraft({ ...fieldDraft, linkTarget: event.target.value })}
                >
                  {(referenceTargets.data?.results ?? [{ id: "role", label: "Roles" }]).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-pulse-ink">
                <input
                  type="checkbox"
                  checked={fieldDraft.linkMultiple}
                  onChange={(event) => setFieldDraft({ ...fieldDraft, linkMultiple: event.target.checked })}
                />
                Allow multiple
              </label>
            </>
          ) : null}
          <FieldValidationFields
            fieldType={fieldDraft.field_type}
            value={fieldDraft.validation}
            onChange={(validation) => setFieldDraft({ ...fieldDraft, validation })}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["required", "Required"],
                ["sensitive", "Sensitive"],
                ["filterable", "Filterable"],
                ["is_primary", "Primary (search/list)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-pulse-ink">
                <input
                  type="checkbox"
                  checked={Boolean(fieldDraft[key])}
                  disabled={key === "is_primary" && fieldDraft.field_type !== "text"}
                  onChange={(event) => setFieldDraft({ ...fieldDraft, [key]: event.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setFieldOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveField.isPending}>
              {saveField.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
