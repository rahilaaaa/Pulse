# 13 — Dynamic Data Model

Status: implemented baseline for custom fields (extended) and custom entities.

## Storage

- **System entities** (`person`, `organization_unit`, `company`, `invitation`, `membership`): `CustomField` definitions + JSONB `custom_data` on the row.
- **Custom entities**: `custom_entities` + `custom_entity_fields` + `custom_entity_records` (JSONB `data`). No per-field tables and no tenant DDL.
- **Lifecycle columns** (for example invitation `accepted_at`, membership `joined_at`) stay real columns and are listed in `RESERVED_KEYS`.

## Field flags

| Flag | Behavior |
| --- | --- |
| `sensitive` | Values omitted from API responses unless the caller has the elevated permission for that entity (`people.update`, `departments.manage`, `company.update`, `membership.invite`, `membership.update`, or `custom_entities.manage`). |
| `self_editable` | Enforced only for Person self-service writes without `people.update`. |
| `filterable` | Only filterable active keys may appear as `filter.<key>` query params. Sensitive filters also require elevation. |

## Invitation vs membership metadata

Invitation and membership `custom_data` bags are independent. Accepting an invitation sets `accepted_at` and does **not** copy invitation custom fields onto Person or Membership.

## Quotas

- 20 custom entities per company
- 50 fields per entity
- 10,000 active records per entity
- Flat JSON payloads, max 50 keys, ~64 KiB

## Permissions

`custom_entities.manage|view|create|update|delete` (seeded into the company catalog; owner floor includes manage).

## Per-field validation (`config.validation`)

Optional stricter rules live under `CustomField.config.validation` / `CustomEntityField.config.validation`. Omit the block (or leave it empty) to keep type-only checks. Enforcement runs in shared `normalize_value` after type coercion.

| Field type | Allowed keys |
| --- | --- |
| `text`, `long_text`, `phone` | `min_length`, `max_length`, `pattern` (`none` / omitted, `digits`, `indian_mobile`) |
| `email` | `max_length` (≤ 254; email format still required) |
| `number` | `min`, `max`, `integer_only` |
| `date` | `min_date`, `max_date` (`YYYY-MM-DD`) |
| `url`, `boolean`, `select`, `multi_select`, `reference` | no validation block (type rules only) |

**`indian_mobile`:** strip spaces/dashes; require exactly 10 digits starting with 6–9. New Phone fields in the Configuration UI default to this preset. Hard caps still apply (text/phone ≤ 500, long_text ≤ 5000, email ≤ 254). Free-form admin regex is not supported.
