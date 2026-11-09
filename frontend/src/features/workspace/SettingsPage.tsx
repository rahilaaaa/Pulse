import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { Modal } from "../../shared/ui/Modal";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import {
  CustomFieldInputs,
  emptyCustomValues,
  serializeCustomData,
  validateRequiredCustomFields,
  type CustomFieldDef,
} from "./CustomFieldInputs";
import { CustomEntitiesSection } from "./CustomEntitiesSection";
import {
  emptyValidation,
  FieldValidationFields,
  supportsFieldValidation,
  validationFromConfig,
  validationPayload,
  type ValidationDraft,
} from "./FieldValidationDraft";
import type { WorkspacePayload } from "./types";

type Settings = {
  display_name: string;
  timezone: string;
  slug: string;
  legal_name: string;
  status: string;
  country_code: string;
  custom_data: Record<string, unknown>;
  created_at: string | null;
  subscription: { plan_name: string; status: string; billing_interval: string; trial_ends_at: string | null } | null;
  billing_name: string;
  billing_email: string;
  gstin: string;
  has_billing_profile: boolean;
};

type CompanyForm = {
  legal_name: string;
  display_name: string;
  timezone: string;
  country_code: string;
  gstin: string;
  billing_name: string;
  billing_email: string;
  custom_data: Record<string, unknown>;
};

const TIMEZONES = [
  ["Asia/Kolkata", "(UTC+05:30) India"],
  ["Asia/Dubai", "(UTC+04:00) Dubai"],
  ["Asia/Singapore", "(UTC+08:00) Singapore"],
  ["Europe/London", "(UTC+00:00) London"],
  ["Europe/Berlin", "(UTC+01:00) Berlin"],
  ["America/New_York", "(UTC−05:00) Eastern Time"],
  ["America/Los_Angeles", "(UTC−08:00) Pacific Time"],
] as const;

const COUNTRIES: Array<{ code: string; label: string }> = [
  { code: "IN", label: "India" },
  { code: "AE", label: "United Arab Emirates" },
  { code: "SG", label: "Singapore" },
  { code: "GB", label: "United Kingdom" },
  { code: "US", label: "United States" },
  { code: "DE", label: "Germany" },
];

type Entity = "person" | "organization_unit" | "company" | "invitation" | "membership";

type CustomField = {
  id: string;
  entity: Entity;
  name: string;
  key: string;
  field_type: string;
  help_text: string;
  required: boolean;
  sensitive: boolean;
  self_editable: boolean;
  filterable: boolean;
  options: string[];
  config?: {
    target?: string;
    multiple?: boolean;
    entity_id?: string;
    validation?: {
      min_length?: number;
      max_length?: number;
      pattern?: string;
      min?: number;
      max?: number;
      integer_only?: boolean;
      min_date?: string;
      max_date?: string;
    };
  };
  position: number;
};

type Section = "custom-fields" | "custom-entities" | "form-layouts" | "field-access" | "validation-rules" | "company";

type FieldDraft = {
  id: string;
  name: string;
  field_type: string;
  help_text: string;
  options: string;
  linkTarget: string;
  linkMultiple: boolean;
  required: boolean;
  sensitive: boolean;
  self_editable: boolean;
  filterable: boolean;
  validation: ValidationDraft;
};

const ENTITIES: Array<{ id: Entity; label: string; empty: string; hint: string }> = [
  {
    id: "person",
    label: "Person",
    empty: "No person fields yet",
    hint: "Add fields to capture information your company needs, like cost centers or emergency contacts.",
  },
  {
    id: "organization_unit",
    label: "Organization Unit",
    empty: "No organization unit fields yet",
    hint: "Add fields that describe departments and teams. Built-in fields like parent unit stay separate.",
  },
  {
    id: "company",
    label: "Company",
    empty: "No company fields yet",
    hint: "Add fields that describe the company record.",
  },
  {
    id: "invitation",
    label: "Invitation",
    empty: "No invitation fields yet",
    hint: "Add metadata captured when inviting someone. Values stay on the invitation; they are not copied to people.",
  },
  {
    id: "membership",
    label: "Membership",
    empty: "No membership fields yet",
    hint: "Add fields on company memberships. These stay separate from invitation and person fields.",
  },
];

const TYPES: Array<{ id: string; label: string }> = [
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

const SECTIONS: Array<{ id: Section; label: string; detail: string; planned?: boolean }> = [
  { id: "company", label: "Company Information", detail: "Identity, localization, and tax details" },
  { id: "custom-fields", label: "Custom Fields", detail: "Define extra data on core records" },
  { id: "custom-entities", label: "Custom Entities", detail: "Define company-scoped record types" },
  { id: "form-layouts", label: "Form Layouts", detail: "Arrange fields on create and edit forms", planned: true },
  { id: "field-access", label: "Field Access", detail: "Control who can view or edit fields", planned: true },
  { id: "validation-rules", label: "Validation Rules", detail: "Add advanced checks beyond required", planned: true },
];

const NAV_GROUPS: Array<{ label: string; ids: Section[] }> = [
  { label: "General", ids: ["company"] },
  { label: "Data model", ids: ["custom-fields", "custom-entities"] },
  { label: "Coming soon", ids: ["form-layouts", "field-access", "validation-rules"] },
];

const cardClass = "rounded-xl border border-pulse-border bg-pulse-surface shadow-sm";
const fieldClass =
  "mt-1 w-full rounded-lg border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink outline-none transition placeholder:text-pulse-muted focus:border-pulse-accent focus:ring-2 focus:ring-[var(--pulse-ring)] disabled:opacity-55";

function sectionFromParam(value: string | null): Section {
  if (value === "custom-fields") return "custom-fields";
  if (value === "custom-entities") return "custom-entities";
  if (value === "form-layouts") return "form-layouts";
  if (value === "field-access") return "field-access";
  if (value === "validation-rules") return "validation-rules";
  return "company";
}

function entityFromParam(value: string | null): Entity {
  if (
    value === "organization_unit" ||
    value === "company" ||
    value === "person" ||
    value === "invitation" ||
    value === "membership"
  ) {
    return value;
  }
  return "person";
}

function linkConfigFromDraft(linkTarget: string, linkMultiple: boolean) {
  if (linkTarget.startsWith("custom_entity:")) {
    return { target: "custom_entity", entity_id: linkTarget.slice("custom_entity:".length), multiple: linkMultiple };
  }
  return { target: linkTarget || "role", multiple: linkMultiple };
}

function titleCase(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

const emptyDraft: FieldDraft = {
  id: "",
  name: "",
  field_type: "text",
  help_text: "",
  options: "",
  linkTarget: "role",
  linkMultiple: true,
  required: false,
  sensitive: false,
  self_editable: true,
  filterable: false,
  validation: emptyValidation("text"),
};

function typeLabel(value: string) {
  return TYPES.find((item) => item.id === value)?.label ?? value;
}

function slugPreview(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "The request failed.";
}

export function SettingsPage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const canUpdate = workspace.permissions.includes("company.update");
  const canManageEntities = workspace.permissions.includes("custom_entities.manage");
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [section, setSection] = useState<Section>(() => sectionFromParam(params.get("section")));
  const [entity, setEntity] = useState<Entity>(() => entityFromParam(params.get("entity")));
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FieldDraft>(emptyDraft);
  const [formError, setFormError] = useState("");
  const [companyForm, setCompanyForm] = useState<CompanyForm>({
    legal_name: "",
    display_name: "",
    timezone: "Asia/Kolkata",
    country_code: "IN",
    gstin: "",
    billing_name: "",
    billing_email: "",
    custom_data: {},
  });
  const [settingsError, setSettingsError] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);

  const settings = useQuery({
    queryKey: ["company-settings", companyId],
    queryFn: () => api<Settings>(`/api/v1/companies/${companyId}/settings/`),
  });
  const companyCustomFields = useQuery({
    queryKey: ["custom-fields", companyId, "company"],
    queryFn: () => api<{ results: CustomFieldDef[] }>(`/api/v1/companies/${companyId}/custom-fields/?entity=company`),
    enabled: section === "company",
  });
  const fields = useQuery({
    queryKey: ["custom-fields", companyId, entity],
    queryFn: () => api<{ results: CustomField[] }>(`/api/v1/companies/${companyId}/custom-fields/?entity=${entity}`),
    enabled: section === "custom-fields",
  });
  const referenceTargets = useQuery({
    queryKey: ["custom-fields", companyId, "reference-targets"],
    queryFn: () => api<{ results: Array<{ id: string; label: string }> }>(`/api/v1/companies/${companyId}/custom-fields/reference-targets/`),
    enabled: section === "custom-fields",
  });
  const linkTargetOptions = referenceTargets.data?.results ?? [];
  const counts = useQuery({
    queryKey: ["custom-fields", companyId, "counts"],
    queryFn: async () => {
      const entries = await Promise.all(
        ENTITIES.map(async (item) => {
          const data = await api<{ results: CustomField[] }>(`/api/v1/companies/${companyId}/custom-fields/?entity=${item.id}`);
          return [item.id, data.results.length] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<Entity, number>;
    },
  });

  useEffect(() => {
    setSection(sectionFromParam(params.get("section")));
    setEntity(entityFromParam(params.get("entity")));
  }, [params]);

  const companyFieldDefs = companyCustomFields.data?.results ?? [];

  useEffect(() => {
    if (!settings.data) return;
    const defs = companyCustomFields.data?.results ?? [];
    setCompanyForm({
      legal_name: settings.data.legal_name,
      display_name: settings.data.display_name,
      timezone: settings.data.timezone,
      country_code: settings.data.country_code || "IN",
      gstin: settings.data.gstin || "",
      billing_name: settings.data.billing_name || "",
      billing_email: settings.data.billing_email || "",
      custom_data: emptyCustomValues(defs, settings.data.custom_data || {}),
    });
    setSettingsSaved(false);
  }, [settings.data, companyCustomFields.data]);

  function selectSection(next: Section) {
    setSection(next);
    const searchParams = new URLSearchParams(params);
    searchParams.set("section", next);
    if (next !== "custom-fields") searchParams.delete("entity");
    else if (!searchParams.get("entity")) searchParams.set("entity", entity);
    setParams(searchParams, { replace: true });
  }

  function selectEntity(next: Entity) {
    setEntity(next);
    setSearch("");
    const searchParams = new URLSearchParams(params);
    searchParams.set("section", "custom-fields");
    searchParams.set("entity", next);
    setParams(searchParams, { replace: true });
  }

  const saveSettings = useMutation({
    mutationFn: (values: CompanyForm) => {
      const body: Record<string, unknown> = {
        legal_name: values.legal_name,
        display_name: values.display_name,
        timezone: values.timezone,
        country_code: values.country_code,
        custom_data: serializeCustomData(companyFieldDefs, values.custom_data),
      };
      if (settings.data?.has_billing_profile) {
        body.gstin = values.gstin;
        body.billing_name = values.billing_name;
        body.billing_email = values.billing_email;
      }
      return api<Settings & { saved: boolean }>(`/api/v1/companies/${companyId}/settings/`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: async () => {
      setSettingsError("");
      setSettingsSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["company-settings", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
      await queryClient.invalidateQueries({ queryKey: ["company-overview"] });
    },
    onError: (error) => {
      setSettingsSaved(false);
      setSettingsError(errorMessage(error));
    },
  });

  const saveField = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        ...(draft.id ? {} : { entity }),
        name: draft.name,
        ...(draft.id ? {} : { field_type: draft.field_type }),
        help_text: draft.help_text,
        required: draft.required,
        sensitive: draft.sensitive,
        self_editable: draft.self_editable,
        filterable: draft.filterable,
        options:
          draft.field_type === "select" || draft.field_type === "multi_select"
            ? draft.options
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean)
            : [],
      };
      if (draft.field_type === "reference") {
        body.config = linkConfigFromDraft(draft.linkTarget, draft.linkMultiple);
      } else if (supportsFieldValidation(draft.field_type)) {
        const rules = validationPayload(draft.field_type, draft.validation);
        body.validation = rules ?? {};
      }
      if (draft.id) {
        return api<CustomField>(`/api/v1/companies/${companyId}/custom-fields/${draft.id}/`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      return api<CustomField>(`/api/v1/companies/${companyId}/custom-fields/`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: async () => {
      setOpen(false);
      setFormError("");
      await queryClient.invalidateQueries({ queryKey: ["custom-fields", companyId] });
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const removeField = useMutation({
    mutationFn: (id: string) => api(`/api/v1/companies/${companyId}/custom-fields/${id}/`, { method: "DELETE" }),
    onSuccess: async () => {
      setFormError("");
      await queryClient.invalidateQueries({ queryKey: ["custom-fields", companyId] });
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const rows = useMemo(() => {
    const list = fields.data?.results ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((row) => row.name.toLowerCase().includes(needle) || row.key.toLowerCase().includes(needle));
  }, [fields.data, search]);

  const totalFields = useMemo(() => {
    if (!counts.data) return 0;
    return ENTITIES.reduce((sum, item) => sum + (counts.data[item.id] ?? 0), 0);
  }, [counts.data]);

  const companyDirty = useMemo(() => {
    if (!settings.data) return false;
    const baseline = {
      legal_name: settings.data.legal_name,
      display_name: settings.data.display_name,
      timezone: settings.data.timezone,
      country_code: settings.data.country_code || "IN",
      gstin: settings.data.gstin || "",
      billing_name: settings.data.billing_name || "",
      billing_email: settings.data.billing_email || "",
      custom_data: serializeCustomData(companyFieldDefs, emptyCustomValues(companyFieldDefs, settings.data.custom_data || {})),
    };
    const current = {
      legal_name: companyForm.legal_name,
      display_name: companyForm.display_name,
      timezone: companyForm.timezone,
      country_code: companyForm.country_code,
      gstin: companyForm.gstin,
      billing_name: companyForm.billing_name,
      billing_email: companyForm.billing_email,
      custom_data: serializeCustomData(companyFieldDefs, companyForm.custom_data),
    };
    return JSON.stringify(baseline) !== JSON.stringify(current);
  }, [settings.data, companyForm, companyFieldDefs]);

  function openCreate() {
    setDraft({ ...emptyDraft, validation: emptyValidation("text") });
    setFormError("");
    setOpen(true);
  }

  function openEdit(row: CustomField) {
    const linkTarget =
      row.config?.target === "custom_entity" && row.config?.entity_id
        ? `custom_entity:${row.config.entity_id}`
        : row.config?.target || "role";
    setDraft({
      id: row.id,
      name: row.name,
      field_type: row.field_type,
      help_text: row.help_text || "",
      options: (row.options || []).join("\n"),
      linkTarget,
      linkMultiple: row.config?.multiple !== false,
      required: row.required,
      sensitive: row.sensitive,
      self_editable: row.self_editable,
      filterable: row.filterable,
      validation: row.config?.validation
        ? validationFromConfig(row.config)
        : emptyValidation(row.field_type === "phone" ? "text" : row.field_type),
    });
    setFormError("");
    setOpen(true);
  }

  if (settings.isLoading) {
    return <LoadingState label="Loading configuration" />;
  }
  if (settings.isError || !settings.data) {
    return (
      <ErrorState
        title="Configuration unavailable"
        body="Company settings could not be loaded. Refresh the page or try again shortly."
        action={
          <Button type="button" variant="secondary" onClick={() => settings.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const current = ENTITIES.find((item) => item.id === entity) ?? ENTITIES[0];
  const keyPreview = draft.id ? undefined : slugPreview(draft.name);
  const selectNeedsOptions = draft.field_type === "select" || draft.field_type === "multi_select";
  const isLinkField = draft.field_type === "reference";
  const plannedSection = SECTIONS.find((item) => item.id === section && item.planned);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-pulse-ink">Configuration</h1>
          <p className="mt-1 max-w-2xl text-sm text-pulse-muted">
            Workspace identity, custom fields, and data-model settings for this company.
          </p>
        </div>
        {section === "custom-fields" && canUpdate ? (
          <Button type="button" onClick={openCreate}>
            Add field
          </Button>
        ) : null}
      </header>

      {!canUpdate ? (
        <p className="rounded-xl border border-pulse-border bg-pulse-hover/60 px-4 py-3 text-sm text-pulse-muted" role="status">
          You can view configuration. Editing requires the company update permission.
        </p>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[15.5rem_1fr]">
        <nav className={`${cardClass} p-2`} aria-label="Configuration sections">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-3 last:mb-0">
              <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-pulse-muted">{group.label}</p>
              <ul className="space-y-0.5">
                {group.ids.map((id) => {
                  const item = SECTIONS.find((row) => row.id === id)!;
                  const active = section === item.id;
                  const fieldCount = item.id === "custom-fields" ? totalFields : null;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`flex w-full flex-col rounded-lg px-3 py-2.5 text-left transition ${
                          active
                            ? "bg-pulse-accent-tint text-pulse-accent-strong ring-1 ring-pulse-accent/25"
                            : "text-pulse-muted hover:bg-pulse-hover hover:text-pulse-ink"
                        }`}
                        onClick={() => selectSection(item.id)}
                      >
                        <span className="flex items-center justify-between gap-2 text-sm font-medium text-inherit">
                          <span className={active ? "text-pulse-ink" : undefined}>{item.label}</span>
                          {item.planned ? (
                            <span className="rounded-md bg-pulse-hover px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pulse-muted">
                              Soon
                            </span>
                          ) : fieldCount != null ? (
                            <span className="rounded-md bg-pulse-hover px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-pulse-muted">
                              {counts.isLoading ? "…" : fieldCount}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 text-xs text-pulse-muted">{item.detail}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="min-w-0 space-y-4">
          {plannedSection ? <ComingSoonPanel item={plannedSection} /> : null}

          {section === "custom-entities" ? (
            <CustomEntitiesSection companyId={companyId} canManage={canManageEntities} />
          ) : null}

          {section === "custom-fields" ? (
            <>
              <div>
                <h2 className="text-lg font-semibold text-pulse-ink">Custom Fields</h2>
                <p className="mt-1 text-sm text-pulse-muted">
                  Field definitions for {current.label}. Values are stored on records; renaming a label does not change the API key.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex rounded-lg border border-pulse-border bg-pulse-hover/40 p-0.5" role="tablist" aria-label="Record type">
                  {ENTITIES.map((item) => {
                    const active = entity === item.id;
                    const count = counts.data?.[item.id] ?? (item.id === entity ? (fields.data?.results.length ?? 0) : 0);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                          active ? "bg-pulse-surface text-pulse-ink shadow-sm" : "text-pulse-muted hover:text-pulse-ink"
                        }`}
                        onClick={() => selectEntity(item.id)}
                      >
                        {item.label}
                        <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
                      </button>
                    );
                  })}
                </div>
                <label className="relative block min-w-0 sm:w-64">
                  <span className="sr-only">Search fields</span>
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-pulse-muted">
                    <SearchIcon />
                  </span>
                  <input
                    className="w-full rounded-lg border border-pulse-border bg-pulse-surface py-2 pl-9 pr-3 text-sm text-pulse-ink outline-none transition placeholder:text-pulse-muted focus:border-pulse-accent focus:ring-2 focus:ring-[var(--pulse-ring)]"
                    placeholder="Search by name or key"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
              </div>

              <div className={`${cardClass} overflow-hidden`}>
                {fields.isLoading ? (
                  <div className="px-6 py-12">
                    <LoadingState label="Loading fields" />
                  </div>
                ) : rows.length === 0 ? (
                  <div className="p-4">
                    <EmptyState
                      title={search.trim() ? "No fields match" : current.empty}
                      body={search.trim() ? "Try another name or API key." : current.hint}
                    />
                    {canUpdate && !search.trim() ? (
                      <div className="mt-4 flex justify-center">
                        <Button type="button" onClick={openCreate}>
                          Add field
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-pulse-border bg-pulse-hover/40 text-[11px] uppercase tracking-wide text-pulse-muted">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Field</th>
                          <th className="px-4 py-3 font-semibold">API key</th>
                          <th className="px-4 py-3 font-semibold">Type</th>
                          <th className="px-4 py-3 font-semibold">Flags</th>
                          <th className="px-4 py-3 font-semibold" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-pulse-border">
                        {rows.map((row) => (
                          <tr key={row.id} className="align-top transition hover:bg-pulse-hover/50">
                            <td className="px-4 py-3">
                              <p className="font-medium text-pulse-ink">{row.name}</p>
                              {row.help_text ? <p className="mt-0.5 text-xs text-pulse-muted">{row.help_text}</p> : null}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-pulse-muted">{row.key}</td>
                            <td className="px-4 py-3 text-pulse-muted">{typeLabel(row.field_type)}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                <FlagChip>{row.required ? "Required" : "Optional"}</FlagChip>
                                {row.sensitive ? <FlagChip tone="warning">Sensitive</FlagChip> : null}
                                <FlagChip>{row.self_editable ? "Editable" : "Read-only"}</FlagChip>
                                {row.filterable ? <FlagChip>Filterable</FlagChip> : null}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {canUpdate ? (
                                <div className="flex justify-end gap-3">
                                  <button
                                    type="button"
                                    className="text-sm font-medium text-pulse-accent hover:text-pulse-accent-strong"
                                    onClick={() => openEdit(row)}
                                  >
                                    Edit
                                  </button>
                                  <ConfirmDialog
                                    title="Delete custom field"
                                    body={`Delete “${row.name}”? The field no longer appears on forms. Stored values stay on records so you can still check previous data.`}
                                    confirmLabel={removeField.isPending ? "Deleting…" : "Delete"}
                                    trigger={
                                      <button type="button" className="text-sm text-pulse-muted hover:text-pulse-danger">
                                        Delete
                                      </button>
                                    }
                                    onConfirm={() => removeField.mutate(row.id)}
                                  />
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              {formError ? <p className="text-sm text-pulse-danger">{formError}</p> : null}
            </>
          ) : null}

          {section === "company" ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                setSettingsSaved(false);
                const requiredError = validateRequiredCustomFields(companyFieldDefs, companyForm.custom_data);
                if (requiredError) {
                  setSettingsError(requiredError);
                  return;
                }
                saveSettings.mutate(companyForm);
              }}
            >
              <div className={`sticky top-16 z-10 flex flex-wrap items-center justify-between gap-3 ${cardClass} px-4 py-3`}>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-pulse-ink">Company Information</h2>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-pulse-muted">
                    <StatusBadge status={settings.data.status} />
                    <span className="font-mono">{settings.data.slug}</span>
                    {companyDirty ? <span className="text-pulse-warning">Unsaved changes</span> : null}
                    {settingsSaved && !companyDirty ? <span className="text-pulse-success">Saved</span> : null}
                  </p>
                </div>
                {canUpdate ? (
                  <Button
                    type="submit"
                    disabled={saveSettings.isPending || !companyDirty || !companyForm.legal_name.trim() || !companyForm.display_name.trim()}
                  >
                    {saveSettings.isPending ? "Saving…" : "Save changes"}
                  </Button>
                ) : null}
              </div>

              {settingsError ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200" role="alert">
                  {settingsError}
                </p>
              ) : null}

              <section className={`${cardClass} p-5`}>
                <h3 className="text-sm font-semibold text-pulse-ink">Identity</h3>
                <p className="mt-0.5 text-xs text-pulse-muted">Legal and display names for this company.</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-pulse-ink">
                    Legal name <span className="text-pulse-danger">*</span>
                    <input
                      className={fieldClass}
                      value={companyForm.legal_name}
                      disabled={!canUpdate}
                      onChange={(event) => setCompanyForm({ ...companyForm, legal_name: event.target.value })}
                      required
                    />
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Display name <span className="text-pulse-danger">*</span>
                    <input
                      className={fieldClass}
                      value={companyForm.display_name}
                      disabled={!canUpdate}
                      onChange={(event) => setCompanyForm({ ...companyForm, display_name: event.target.value })}
                      required
                    />
                  </label>
                </div>
              </section>

              <section className={`${cardClass} p-5`}>
                <h3 className="text-sm font-semibold text-pulse-ink">Localization</h3>
                <p className="mt-0.5 text-xs text-pulse-muted">Country and timezone used across the workspace.</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-pulse-ink">
                    Country
                    <select
                      className={fieldClass}
                      value={companyForm.country_code}
                      disabled={!canUpdate}
                      onChange={(event) => setCompanyForm({ ...companyForm, country_code: event.target.value })}
                    >
                      {COUNTRIES.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.label}
                        </option>
                      ))}
                      {companyForm.country_code && !COUNTRIES.some((country) => country.code === companyForm.country_code) ? (
                        <option value={companyForm.country_code}>{companyForm.country_code}</option>
                      ) : null}
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Timezone
                    <select
                      className={fieldClass}
                      value={companyForm.timezone}
                      disabled={!canUpdate}
                      onChange={(event) => setCompanyForm({ ...companyForm, timezone: event.target.value })}
                    >
                      {TIMEZONES.map(([zone, label]) => (
                        <option key={zone} value={zone}>
                          {label}
                        </option>
                      ))}
                      {companyForm.timezone && !TIMEZONES.some(([zone]) => zone === companyForm.timezone) ? (
                        <option value={companyForm.timezone}>{companyForm.timezone}</option>
                      ) : null}
                    </select>
                  </label>
                </div>
              </section>

              {companyFieldDefs.length > 0 ? (
                <section className={`${cardClass} p-5`}>
                  <fieldset disabled={!canUpdate} className="min-w-0 disabled:opacity-70">
                    <CustomFieldInputs
                      companyId={companyId}
                      defs={companyFieldDefs}
                      values={companyForm.custom_data}
                      onChange={(custom_data) => setCompanyForm({ ...companyForm, custom_data })}
                    />
                  </fieldset>
                </section>
              ) : null}

              <section className={`${cardClass} p-5`}>
                <h3 className="text-sm font-semibold text-pulse-ink">Tax and billing contact</h3>
                <p className="mt-0.5 text-xs text-pulse-muted">
                  GSTIN is optional. A matching value is a format check, not proof of registration.
                </p>
                {!settings.data.has_billing_profile ? (
                  <p className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                    Billing contact fields are available after the company billing profile is completed.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-medium text-pulse-ink sm:col-span-2">
                      GSTIN <span className="font-normal text-pulse-muted">Optional</span>
                      <input
                        className={fieldClass}
                        value={companyForm.gstin}
                        disabled={!canUpdate}
                        placeholder="Not provided"
                        onChange={(event) => setCompanyForm({ ...companyForm, gstin: event.target.value.toUpperCase() })}
                      />
                    </label>
                    <label className="block text-sm font-medium text-pulse-ink">
                      Billing name
                      <input
                        className={fieldClass}
                        value={companyForm.billing_name}
                        disabled={!canUpdate}
                        onChange={(event) => setCompanyForm({ ...companyForm, billing_name: event.target.value })}
                      />
                    </label>
                    <label className="block text-sm font-medium text-pulse-ink">
                      Billing email
                      <input
                        className={fieldClass}
                        type="email"
                        value={companyForm.billing_email}
                        disabled={!canUpdate}
                        onChange={(event) => setCompanyForm({ ...companyForm, billing_email: event.target.value })}
                      />
                    </label>
                  </div>
                )}
              </section>

              <section className={`${cardClass} p-5`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-pulse-ink">Subscription</h3>
                    <p className="mt-0.5 text-xs text-pulse-muted">Plan details are managed in Billing.</p>
                  </div>
                  <Link to="/app/billing" className="text-sm font-medium text-pulse-accent hover:text-pulse-accent-strong">
                    Open billing
                  </Link>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-lg bg-pulse-hover/60 px-3 py-2.5">
                    <dt className="text-xs text-pulse-muted">Plan</dt>
                    <dd className="mt-0.5 font-medium text-pulse-ink">
                      {settings.data.subscription
                        ? `${settings.data.subscription.plan_name} · ${titleCase(settings.data.subscription.status)}`
                        : "No plan"}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-pulse-hover/60 px-3 py-2.5">
                    <dt className="text-xs text-pulse-muted">Member since</dt>
                    <dd className="mt-0.5 font-medium text-pulse-ink">
                      {settings.data.created_at
                        ? new Date(settings.data.created_at).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </section>
            </form>
          ) : null}
        </div>
      </div>

      <Modal
        open={open}
        title={draft.id ? "Edit custom field" : `Add ${current.label} field`}
        description={
          draft.id
            ? "Update the label and settings. The API key stays stable so stored values are preserved."
            : "Create a field definition. The API key is generated from the label."
        }
        onClose={() => setOpen(false)}
        wide
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={saveField.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                saveField.isPending ||
                !draft.name.trim() ||
                (selectNeedsOptions &&
                  !draft.options
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean).length)
              }
              onClick={() => saveField.mutate()}
            >
              {saveField.isPending ? "Saving…" : draft.id ? "Save field" : "Add field"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-pulse-ink">
              Label <span className="text-pulse-danger">*</span>
              <input
                className={fieldClass}
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                required
                autoFocus
              />
            </label>
            <label className="block text-sm font-medium text-pulse-ink">
              API key
              <input
                className={`${fieldClass} font-mono text-xs text-pulse-muted`}
                value={draft.id ? (fields.data?.results.find((row) => row.id === draft.id)?.key ?? "") : keyPreview || "—"}
                readOnly
                disabled
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-pulse-ink">
              Type <span className="text-pulse-danger">*</span>
              <select
                className={fieldClass}
                value={draft.field_type}
                disabled={Boolean(draft.id)}
                onChange={(event) => {
                  const field_type = event.target.value;
                  setDraft({
                    ...draft,
                    field_type,
                    validation: emptyValidation(field_type),
                    ...(field_type === "reference"
                      ? {
                          linkTarget: linkTargetOptions[0]?.id || draft.linkTarget || "role",
                          linkMultiple: true,
                        }
                      : {}),
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
            <label className="block text-sm font-medium text-pulse-ink">
              Help text <span className="font-normal text-pulse-muted">Optional</span>
              <input
                className={fieldClass}
                value={draft.help_text}
                onChange={(event) => setDraft({ ...draft, help_text: event.target.value })}
                placeholder="Shown under the field on forms"
              />
            </label>
          </div>
          {selectNeedsOptions ? (
            <label className="block text-sm font-medium text-pulse-ink">
              Options <span className="text-pulse-danger">*</span>
              <textarea
                className={fieldClass}
                rows={3}
                placeholder="One option per line"
                value={draft.options}
                onChange={(event) => setDraft({ ...draft, options: event.target.value })}
              />
            </label>
          ) : null}
          {isLinkField ? (
            <div className="space-y-3 rounded-lg border border-pulse-border p-3">
              <p className="text-xs text-pulse-muted">
                Link fields pick from live company records. Values are stored on the record and do not automatically grant login permissions.
              </p>
              <label className="block text-sm font-medium text-pulse-ink">
                Link to <span className="text-pulse-danger">*</span>
                <select
                  className={fieldClass}
                  value={draft.linkTarget}
                  disabled={Boolean(draft.id)}
                  onChange={(event) => setDraft({ ...draft, linkTarget: event.target.value })}
                >
                  {linkTargetOptions.length === 0 ? <option value={draft.linkTarget || "role"}>Roles</option> : null}
                  {linkTargetOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <Toggle
                label="Allow multiple"
                detail="Allow selecting more than one linked record."
                checked={draft.linkMultiple}
                onChange={(value) => setDraft({ ...draft, linkMultiple: value })}
              />
            </div>
          ) : null}
          <FieldValidationFields
            fieldType={draft.field_type}
            value={draft.validation}
            onChange={(validation) => setDraft({ ...draft, validation })}
          />
          <div className="divide-y divide-pulse-border rounded-lg border border-pulse-border">
            <Toggle label="Required" detail="Must be filled when the record is saved." checked={draft.required} onChange={(value) => setDraft({ ...draft, required: value })} />
            <Toggle
              label="Sensitive"
              detail="Marked for restricted visibility. Enforcement follows company permissions."
              checked={draft.sensitive}
              onChange={(value) => setDraft({ ...draft, sensitive: value })}
            />
            <Toggle
              label="Self-editable"
              detail="People can edit this on their own record when supported."
              checked={draft.self_editable}
              onChange={(value) => setDraft({ ...draft, self_editable: value })}
            />
            <Toggle
              label="Filterable"
              detail="Available as a filter in lists when filtering is supported."
              checked={draft.filterable}
              onChange={(value) => setDraft({ ...draft, filterable: value })}
            />
          </div>
          {formError ? <p className="text-sm text-pulse-danger">{formError}</p> : null}
        </div>
      </Modal>
    </div>
  );
}

function ComingSoonPanel({ item }: { item: { label: string; detail: string } }) {
  return (
    <div className={`${cardClass} px-6 py-14 text-center`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-pulse-muted">Coming soon</p>
      <h2 className="mt-2 text-lg font-semibold text-pulse-ink">{item.label}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-pulse-muted">{item.detail}</p>
      <p className="mt-4 text-sm text-pulse-muted">Planned for a later release.</p>
    </div>
  );
}

function FlagChip({ children, tone }: { children: ReactNode; tone?: "warning" }) {
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
        tone === "warning" ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" : "bg-pulse-hover text-pulse-muted"
      }`}
    >
      {children}
    </span>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16.5 16.5 20 20" />
    </svg>
  );
}

function Toggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-3">
      <div>
        <p className="text-sm font-medium text-pulse-ink">{label}</p>
        <p className="text-xs text-pulse-muted">{detail}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-pulse-accent" : "bg-pulse-border"}`}
        onClick={() => onChange(!checked)}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${checked ? "left-5" : "left-0.5"}`} />
      </button>
    </div>
  );
}
