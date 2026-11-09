export type ValidationDraft = {
  pattern: "none" | "digits" | "indian_mobile";
  min_length: string;
  max_length: string;
  min: string;
  max: string;
  integer_only: boolean;
  min_date: string;
  max_date: string;
};

export type FieldValidationConfig = {
  min_length?: number;
  max_length?: number;
  pattern?: string;
  min?: number;
  max?: number;
  integer_only?: boolean;
  min_date?: string;
  max_date?: string;
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink outline-none transition placeholder:text-pulse-muted focus:border-pulse-accent focus:ring-2 focus:ring-[var(--pulse-ring)] disabled:opacity-55";

export function emptyValidation(fieldType = "text"): ValidationDraft {
  if (fieldType === "phone") {
    return {
      pattern: "indian_mobile",
      min_length: "10",
      max_length: "10",
      min: "",
      max: "",
      integer_only: false,
      min_date: "",
      max_date: "",
    };
  }
  return {
    pattern: "none",
    min_length: "",
    max_length: "",
    min: "",
    max: "",
    integer_only: false,
    min_date: "",
    max_date: "",
  };
}

export function validationFromConfig(config?: { validation?: FieldValidationConfig } | null): ValidationDraft {
  const rules = config?.validation;
  if (!rules) return emptyValidation("text");
  const pattern =
    rules.pattern === "digits" || rules.pattern === "indian_mobile" ? rules.pattern : "none";
  return {
    pattern,
    min_length: rules.min_length != null ? String(rules.min_length) : "",
    max_length: rules.max_length != null ? String(rules.max_length) : "",
    min: rules.min != null ? String(rules.min) : "",
    max: rules.max != null ? String(rules.max) : "",
    integer_only: Boolean(rules.integer_only),
    min_date: rules.min_date || "",
    max_date: rules.max_date || "",
  };
}

function parseOptionalInt(raw: string): number | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0) return undefined;
  return value;
}

function parseOptionalNumber(raw: string): number | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  const value = Number(text);
  if (!Number.isFinite(value)) return undefined;
  return value;
}

/** Build API validation object, or undefined when there are no rules. */
export function validationPayload(fieldType: string, draft: ValidationDraft): FieldValidationConfig | undefined {
  if (fieldType === "text" || fieldType === "long_text" || fieldType === "phone") {
    const out: FieldValidationConfig = {};
    const minLength = parseOptionalInt(draft.min_length);
    const maxLength = parseOptionalInt(draft.max_length);
    if (minLength != null) out.min_length = minLength;
    if (maxLength != null) out.max_length = maxLength;
    if (draft.pattern !== "none") out.pattern = draft.pattern;
    return Object.keys(out).length ? out : undefined;
  }
  if (fieldType === "email") {
    const maxLength = parseOptionalInt(draft.max_length);
    if (maxLength != null) return { max_length: maxLength };
    return undefined;
  }
  if (fieldType === "number") {
    const out: FieldValidationConfig = {};
    const min = parseOptionalNumber(draft.min);
    const max = parseOptionalNumber(draft.max);
    if (min != null) out.min = min;
    if (max != null) out.max = max;
    if (draft.integer_only) out.integer_only = true;
    return Object.keys(out).length ? out : undefined;
  }
  if (fieldType === "date") {
    const out: FieldValidationConfig = {};
    if (draft.min_date.trim()) out.min_date = draft.min_date.trim();
    if (draft.max_date.trim()) out.max_date = draft.max_date.trim();
    return Object.keys(out).length ? out : undefined;
  }
  return undefined;
}

export function supportsFieldValidation(fieldType: string) {
  return ["text", "long_text", "phone", "email", "number", "date"].includes(fieldType);
}

export function FieldValidationFields({
  fieldType,
  value,
  onChange,
  disabled = false,
}: {
  fieldType: string;
  value: ValidationDraft;
  onChange: (next: ValidationDraft) => void;
  disabled?: boolean;
}) {
  if (!supportsFieldValidation(fieldType)) return null;

  return (
    <div className="space-y-3 rounded-lg border border-pulse-border bg-pulse-canvas/40 p-3">
      <div>
        <p className="text-sm font-medium text-pulse-ink">Validation</p>
        <p className="text-xs text-pulse-muted">Optional stricter checks for this field. Leave blank to use type defaults only.</p>
      </div>
      {(fieldType === "text" || fieldType === "long_text" || fieldType === "phone") && (
        <>
          <label className="block text-sm font-medium text-pulse-ink">
            Pattern
            <select
              className={fieldClass}
              value={value.pattern}
              disabled={disabled}
              onChange={(event) => {
                const pattern = event.target.value as ValidationDraft["pattern"];
                if (pattern === "indian_mobile") {
                  onChange({ ...value, pattern, min_length: "10", max_length: "10" });
                } else {
                  onChange({ ...value, pattern });
                }
              }}
            >
              <option value="none">None</option>
              <option value="digits">Digits only</option>
              <option value="indian_mobile">Indian mobile (10 digits)</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-pulse-ink">
              Min length
              <input
                className={fieldClass}
                type="number"
                min={0}
                value={value.min_length}
                disabled={disabled || value.pattern === "indian_mobile"}
                onChange={(event) => onChange({ ...value, min_length: event.target.value })}
              />
            </label>
            <label className="block text-sm font-medium text-pulse-ink">
              Max length
              <input
                className={fieldClass}
                type="number"
                min={0}
                value={value.max_length}
                disabled={disabled || value.pattern === "indian_mobile"}
                onChange={(event) => onChange({ ...value, max_length: event.target.value })}
              />
            </label>
          </div>
        </>
      )}
      {fieldType === "email" ? (
        <label className="block text-sm font-medium text-pulse-ink">
          Max length
          <input
            className={fieldClass}
            type="number"
            min={1}
            max={254}
            value={value.max_length}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, max_length: event.target.value })}
            placeholder="254"
          />
        </label>
      ) : null}
      {fieldType === "number" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-pulse-ink">
              Minimum
              <input
                className={fieldClass}
                type="number"
                value={value.min}
                disabled={disabled}
                onChange={(event) => onChange({ ...value, min: event.target.value })}
              />
            </label>
            <label className="block text-sm font-medium text-pulse-ink">
              Maximum
              <input
                className={fieldClass}
                type="number"
                value={value.max}
                disabled={disabled}
                onChange={(event) => onChange({ ...value, max: event.target.value })}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-pulse-ink">
            <input
              type="checkbox"
              checked={value.integer_only}
              disabled={disabled}
              onChange={(event) => onChange({ ...value, integer_only: event.target.checked })}
            />
            Whole numbers only
          </label>
        </>
      ) : null}
      {fieldType === "date" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-pulse-ink">
            Earliest date
            <input
              className={fieldClass}
              type="date"
              value={value.min_date}
              disabled={disabled}
              onChange={(event) => onChange({ ...value, min_date: event.target.value })}
            />
          </label>
          <label className="block text-sm font-medium text-pulse-ink">
            Latest date
            <input
              className={fieldClass}
              type="date"
              value={value.max_date}
              disabled={disabled}
              onChange={(event) => onChange({ ...value, max_date: event.target.value })}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
