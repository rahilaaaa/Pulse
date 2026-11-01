import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api } from "../../shared/api/client";
import { personName } from "./format";

export type CustomFieldDef = {
  id: string;
  name: string;
  key: string;
  field_type: string;
  help_text?: string;
  required: boolean;
  sensitive?: boolean;
  self_editable?: boolean;
  filterable?: boolean;
  is_primary?: boolean;
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
};

function inputHints(def: CustomFieldDef): {
  maxLength?: number;
  minLength?: number;
  min?: number | string;
  max?: number | string;
  inputMode?: "text" | "numeric" | "tel" | "email" | "url" | "decimal";
  placeholder?: string;
  step?: string | number;
} {
  const rules = def.config?.validation;
  const hints: ReturnType<typeof inputHints> = {};
  if (!rules) {
    if (def.field_type === "phone") hints.inputMode = "tel";
    if (def.field_type === "email") hints.inputMode = "email";
    if (def.field_type === "url") hints.inputMode = "url";
    if (def.field_type === "number") hints.inputMode = "decimal";
    return hints;
  }
  if (typeof rules.max_length === "number") hints.maxLength = rules.max_length;
  if (typeof rules.min_length === "number") hints.minLength = rules.min_length;
  if (typeof rules.min === "number") hints.min = rules.min;
  if (typeof rules.max === "number") hints.max = rules.max;
  if (rules.min_date) hints.min = rules.min_date;
  if (rules.max_date) hints.max = rules.max_date;
  if (rules.pattern === "indian_mobile") {
    hints.inputMode = "tel";
    hints.maxLength = 10;
    hints.minLength = 10;
    hints.placeholder = "10-digit mobile";
  } else if (rules.pattern === "digits") {
    hints.inputMode = "numeric";
    hints.placeholder = "Digits only";
  } else if (def.field_type === "phone") {
    hints.inputMode = "tel";
  } else if (def.field_type === "email") {
    hints.inputMode = "email";
  } else if (def.field_type === "url") {
    hints.inputMode = "url";
  } else if (def.field_type === "number") {
    hints.inputMode = rules.integer_only ? "numeric" : "decimal";
    if (rules.integer_only) hints.step = 1;
  }
  return hints;
}

type RefOption = { id: string; label: string };

const fieldClass =
  "mt-1 w-full rounded-lg border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink outline-none transition placeholder:text-pulse-muted focus:border-pulse-accent focus:ring-2 focus:ring-[var(--pulse-ring)]";

function isMultiReference(def: CustomFieldDef) {
  return def.field_type === "reference" && def.config?.multiple !== false;
}

export function emptyCustomValues(defs: CustomFieldDef[], existing?: Record<string, unknown>) {
  const values: Record<string, unknown> = {};
  for (const def of defs) {
    if (existing && def.key in existing) {
      values[def.key] = existing[def.key];
    } else if (def.field_type === "boolean") {
      values[def.key] = false;
    } else if (def.field_type === "multi_select" || isMultiReference(def)) {
      values[def.key] = [];
    } else {
      values[def.key] = "";
    }
  }
  return values;
}

export function validateRequiredCustomFields(defs: CustomFieldDef[], values: Record<string, unknown>) {
  for (const def of defs) {
    if (!def.required) continue;
    const value = values[def.key];
    if (value == null) return `${def.name} is required.`;
    if (typeof value === "string" && !value.trim()) return `${def.name} is required.`;
    if (Array.isArray(value) && value.length === 0) return `${def.name} is required.`;
  }
  return "";
}

/** Strip empty optional values before send; keep booleans and filled values. */
export function serializeCustomData(defs: CustomFieldDef[], values: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const def of defs) {
    const value = values[def.key];
    if (def.field_type === "boolean") {
      out[def.key] = Boolean(value);
      continue;
    }
    if (def.field_type === "multi_select" || isMultiReference(def)) {
      const list = Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
      if (list.length || def.required) out[def.key] = list;
      continue;
    }
    if (def.field_type === "reference") {
      const trimmed = typeof value === "string" ? value.trim() : "";
      if (trimmed || def.required) out[def.key] = trimmed;
      continue;
    }
    if (def.field_type === "number") {
      if (value === "" || value == null) {
        if (def.required) out[def.key] = value;
        continue;
      }
      const number = typeof value === "number" ? value : Number(value);
      out[def.key] = Number.isFinite(number) ? number : value;
      continue;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed || def.required) out[def.key] = trimmed;
      continue;
    }
    if (value != null) out[def.key] = value;
  }
  return out;
}

export function formatCustomFieldDisplay(def: CustomFieldDef, raw: unknown, labelsById?: Record<string, string>) {
  if (raw == null || raw === "") return "—";
  if (def.field_type === "reference") {
    const ids = Array.isArray(raw) ? raw.map(String) : [String(raw)];
    const labels = ids.map((id) => labelsById?.[id] || id).filter(Boolean);
    return labels.length ? labels.join(", ") : "—";
  }
  if (Array.isArray(raw)) return raw.length ? raw.join(", ") : "—";
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  return String(raw);
}

function useReferenceOptions(
  companyId: string,
  target: string | undefined,
  entityId?: string,
): { options: RefOption[]; loading: boolean; emptyLabel: string } {
  const roles = useQuery({
    queryKey: ["roles", companyId],
    queryFn: () => api<{ results: Array<{ id: string; name: string; is_owner_role?: boolean }> }>(`/api/v1/companies/${companyId}/roles/`),
    enabled: Boolean(companyId) && target === "role",
  });
  const people = useQuery({
    queryKey: ["people", companyId],
    queryFn: () =>
      api<{
        results: Array<{ person_id: string | null; first_name: string; last_name: string; email: string }>;
      }>(`/api/v1/companies/${companyId}/people/`),
    enabled: Boolean(companyId) && target === "person",
  });
  const units = useQuery({
    queryKey: ["organization", companyId],
    queryFn: () => api<{ units: Array<{ id: string; name: string; status?: string }> }>(`/api/v1/companies/${companyId}/organization/units/`),
    enabled: Boolean(companyId) && target === "organization_unit",
  });
  const customRecords = useQuery({
    queryKey: ["custom-entity-records", companyId, entityId, "ref"],
    queryFn: () =>
      api<{ results: Array<{ id: string; data: Record<string, unknown> }> }>(
        `/api/v1/companies/${companyId}/custom-entities/${entityId}/records/?page_size=100`,
      ),
    enabled: Boolean(companyId) && target === "custom_entity" && Boolean(entityId),
  });

  if (target === "role") {
    return {
      loading: roles.isLoading,
      emptyLabel: "No roles available.",
      options: (roles.data?.results ?? [])
        .filter((role) => !role.is_owner_role)
        .map((role) => ({ id: role.id, label: role.name })),
    };
  }
  if (target === "custom_entity") {
    return {
      loading: customRecords.isLoading,
      emptyLabel: "No linked records available.",
      options: (customRecords.data?.results ?? []).map((row) => {
        const label = Object.values(row.data || {}).find((value) => typeof value === "string" && value.trim()) ?? row.id;
        return { id: row.id, label: String(label) };
      }),
    };
  }
  if (target === "person") {
    return {
      loading: people.isLoading,
      emptyLabel: "No people available.",
      options: (people.data?.results ?? [])
        .filter((row) => row.person_id)
        .map((row) => ({
          id: row.person_id as string,
          label: personName(row.first_name, row.last_name, row.email),
        })),
    };
  }
  if (target === "organization_unit") {
    return {
      loading: units.isLoading,
      emptyLabel: "No organization units available.",
      options: (units.data?.units ?? [])
        .filter((unit) => (unit.status ?? "active") === "active")
        .map((unit) => ({ id: unit.id, label: unit.name })),
    };
  }
  return { options: [], loading: false, emptyLabel: "No options available." };
}

function ReferenceInput({
  def,
  companyId,
  current,
  onChange,
  label,
  help,
}: {
  def: CustomFieldDef;
  companyId: string;
  current: unknown;
  onChange: (value: unknown) => void;
  label: ReactNode;
  help: ReactNode;
}) {
  const target = def.config?.target;
  const { options, loading, emptyLabel } = useReferenceOptions(companyId, target, def.config?.entity_id);
  const multiple = def.config?.multiple !== false;
  const loadingLabel =
    target === "person"
      ? "Loading people…"
      : target === "organization_unit"
        ? "Loading units…"
        : target === "custom_entity"
          ? "Loading records…"
          : "Loading roles…";

  if (multiple) {
    const selected = Array.isArray(current) ? (current as string[]) : [];
    return (
      <fieldset className="text-sm">
        <legend className="font-medium text-pulse-ink">{label}</legend>
        <div className="mt-2 space-y-1 rounded-lg border border-pulse-border p-2">
          {loading ? <p className="px-2 py-1.5 text-pulse-muted">{loadingLabel}</p> : null}
          {!loading && options.length === 0 ? <p className="px-2 py-1.5 text-pulse-muted">{emptyLabel}</p> : null}
          {options.map((option) => (
            <label key={option.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-pulse-hover">
              <input
                type="checkbox"
                className="accent-pulse-accent"
                checked={selected.includes(option.id)}
                onChange={(event) =>
                  onChange(event.target.checked ? [...selected, option.id] : selected.filter((item) => item !== option.id))
                }
              />
              <span className="text-pulse-ink">{option.label}</span>
            </label>
          ))}
        </div>
        {help}
      </fieldset>
    );
  }

  return (
    <label className="block text-sm font-medium text-pulse-ink">
      {label}
      <select
        className={fieldClass}
        value={typeof current === "string" ? current : ""}
        onChange={(event) => onChange(event.target.value)}
        required={def.required}
      >
        <option value="">Select…</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {help}
    </label>
  );
}

export function CustomFieldInputs({
  defs,
  values,
  onChange,
  companyId,
}: {
  defs: CustomFieldDef[];
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  companyId?: string;
}) {
  if (!defs.length) return null;

  function setKey(key: string, value: unknown) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-pulse-ink">Additional fields</h3>
        <p className="mt-0.5 text-xs text-pulse-muted">Configured custom fields for this record type.</p>
      </div>
      {defs.map((def) => {
        const label = (
          <>
            {def.name}
            {def.required ? <span className="text-pulse-danger"> *</span> : null}
          </>
        );
        const help = def.help_text ? <p className="mt-1 text-xs text-pulse-muted">{def.help_text}</p> : null;
        const current = values[def.key];

        if (def.field_type === "reference" && def.config?.target && companyId) {
          return (
            <ReferenceInput
              key={def.id}
              def={def}
              companyId={companyId}
              current={current}
              onChange={(value) => setKey(def.key, value)}
              label={label}
              help={help}
            />
          );
        }

        if (def.field_type === "long_text") {
          const hints = inputHints(def);
          return (
            <label key={def.id} className="block text-sm font-medium text-pulse-ink">
              {label}
              <textarea
                className={fieldClass}
                rows={3}
                value={typeof current === "string" ? current : ""}
                onChange={(event) => setKey(def.key, event.target.value)}
                required={def.required}
                maxLength={hints.maxLength}
                minLength={hints.minLength}
                placeholder={hints.placeholder}
              />
              {help}
            </label>
          );
        }

        if (def.field_type === "boolean") {
          return (
            <label key={def.id} className="flex items-start gap-3 text-sm font-medium text-pulse-ink">
              <input
                type="checkbox"
                className="mt-1 accent-pulse-accent"
                checked={Boolean(current)}
                onChange={(event) => setKey(def.key, event.target.checked)}
              />
              <span>
                <span className="block">{label}</span>
                {help}
              </span>
            </label>
          );
        }

        if (def.field_type === "select") {
          return (
            <label key={def.id} className="block text-sm font-medium text-pulse-ink">
              {label}
              <select
                className={fieldClass}
                value={typeof current === "string" ? current : ""}
                onChange={(event) => setKey(def.key, event.target.value)}
                required={def.required}
              >
                <option value="">Select…</option>
                {(def.options || []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {help}
            </label>
          );
        }

        if (def.field_type === "multi_select") {
          const selected = Array.isArray(current) ? (current as string[]) : [];
          return (
            <fieldset key={def.id} className="text-sm">
              <legend className="font-medium text-pulse-ink">{label}</legend>
              <div className="mt-2 space-y-1 rounded-lg border border-pulse-border p-2">
                {(def.options || []).map((option) => (
                  <label key={option} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-pulse-hover">
                    <input
                      type="checkbox"
                      className="accent-pulse-accent"
                      checked={selected.includes(option)}
                      onChange={(event) =>
                        setKey(
                          def.key,
                          event.target.checked ? [...selected, option] : selected.filter((item) => item !== option),
                        )
                      }
                    />
                    <span className="text-pulse-ink">{option}</span>
                  </label>
                ))}
              </div>
              {help}
            </fieldset>
          );
        }

        const inputType =
          def.field_type === "number" ? "number" : def.field_type === "date" ? "date" : def.field_type === "email" ? "email" : def.field_type === "url" ? "url" : "text";
        const hints = inputHints(def);

        return (
          <label key={def.id} className="block text-sm font-medium text-pulse-ink">
            {label}
            <input
              className={fieldClass}
              type={inputType}
              value={current == null ? "" : String(current)}
              onChange={(event) => setKey(def.key, event.target.value)}
              required={def.required}
              maxLength={hints.maxLength}
              minLength={hints.minLength}
              min={hints.min}
              max={hints.max}
              inputMode={hints.inputMode}
              placeholder={hints.placeholder}
              step={hints.step}
            />
            {help}
          </label>
        );
      })}
    </div>
  );
}
