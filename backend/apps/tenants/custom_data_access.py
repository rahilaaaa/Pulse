"""Flag-aware serialize / write / filter helpers for custom_data bags."""

from __future__ import annotations

from typing import Iterable

from apps.tenants.field_types import ensure_flat_payload, invalid, normalize_value
from apps.tenants.models import CustomField, FieldEntity, FieldStatus

# Elevated permissions that may read/write sensitive values for each system entity.
SENSITIVE_ELEVATED = {
    FieldEntity.PERSON: "people.update",
    FieldEntity.ORGANIZATION_UNIT: "departments.manage",
    FieldEntity.COMPANY: "company.update",
    FieldEntity.INVITATION: "membership.invite",
    FieldEntity.MEMBERSHIP: "membership.update",
    FieldEntity.TASK: "company.update",
    "custom_entity": "custom_entities.manage",
}

# Self-editable applies only to Person in the initial release.
SELF_EDITABLE_ENTITIES = {FieldEntity.PERSON}


def elevated_for(entity: str) -> str | None:
    return SENSITIVE_ELEVATED.get(entity)


def can_see_sensitive(entity: str, permission_codes: Iterable[str]) -> bool:
    code = elevated_for(entity)
    if code is None:
        return False
    return code in set(permission_codes)


def can_write_sensitive(entity: str, permission_codes: Iterable[str]) -> bool:
    return can_see_sensitive(entity, permission_codes)


def serialize_custom_data(
    definitions: list,
    values: dict | None,
    *,
    entity: str,
    permission_codes: Iterable[str],
    is_self: bool = False,
) -> dict:
    """Return custom_data safe for API responses.

    Sensitive keys are omitted for non-elevated callers. Self-view never sees
    sensitive person fields unless elevated.
    """
    values = dict(values or {})
    codes = set(permission_codes)
    elevated = can_see_sensitive(entity, codes)
    # Person self-view: even with people.view, sensitive stays hidden without people.update.
    if entity == FieldEntity.PERSON and is_self and not elevated:
        elevated = False
    by_key = {getattr(row, "key"): row for row in definitions}
    result = {}
    for key, value in values.items():
        definition = by_key.get(key)
        if definition is not None and getattr(definition, "sensitive", False) and not elevated:
            continue
        result[key] = value
    return result


def assert_writable_custom_keys(
    definitions: list,
    incoming: dict,
    *,
    entity: str,
    permission_codes: Iterable[str],
    is_self: bool = False,
    field_prefix: str = "custom_data",
) -> None:
    """Reject writes the caller is not allowed to make under flag rules."""
    codes = set(permission_codes)
    elevated = can_write_sensitive(entity, codes)
    by_key = {getattr(row, "key"): row for row in definitions}
    for key in incoming:
        definition = by_key.get(key)
        if definition is None:
            continue
        path = f"{field_prefix}.{key}"
        if getattr(definition, "sensitive", False) and not elevated:
            invalid(path, "You do not have permission to edit this field.")
        if (
            entity in SELF_EDITABLE_ENTITIES
            and is_self
            and not elevated
            and not getattr(definition, "self_editable", True)
        ):
            invalid(path, "This field can only be edited by an administrator.")
        if (
            entity in SELF_EDITABLE_ENTITIES
            and is_self
            and not elevated
            and getattr(definition, "sensitive", False)
        ):
            invalid(path, "You do not have permission to edit this field.")


def filterable_definitions(definitions: list) -> dict:
    return {
        row.key: row
        for row in definitions
        if getattr(row, "filterable", False) and getattr(row, "status", FieldStatus.ACTIVE) == FieldStatus.ACTIVE
    }


def parse_custom_filters(
    query_params,
    definitions: list,
    *,
    entity: str,
    permission_codes: Iterable[str],
    prefix: str = "filter.",
) -> dict:
    """Extract and validate custom field filters from query params.

    Accepts keys like filter.<field_key>=value. Rejects non-filterable and
    sensitive keys for non-elevated callers.
    """
    codes = set(permission_codes)
    elevated = can_see_sensitive(entity, codes)
    allowed = filterable_definitions(definitions)
    filters = {}
    for raw_key, raw_value in query_params.items():
        if not raw_key.startswith(prefix):
            continue
        key = raw_key[len(prefix) :]
        definition = allowed.get(key)
        if definition is None:
            invalid(raw_key, "That field cannot be used as a filter.")
        if getattr(definition, "sensitive", False) and not elevated:
            invalid(raw_key, "You do not have permission to filter on this field.")
        filters[key] = raw_value
    return filters


def apply_json_filters(queryset, filters: dict, json_field: str = "custom_data"):
    """Apply equality containment filters against a JSONField."""
    for key, value in filters.items():
        queryset = queryset.filter(**{f"{json_field}__{key}": value})
    return queryset


def load_active_definitions(company, entity: str):
    return list(
        CustomField.objects.filter(company=company, entity=entity, status=FieldStatus.ACTIVE).order_by(
            "position", "name"
        )
    )


def normalize_custom_data(
    company,
    entity: str,
    incoming,
    *,
    creating: bool,
    existing=None,
    permission_codes: Iterable[str] | None = None,
    is_self: bool = False,
    field_prefix: str = "custom_data",
):
    """Validate and normalize a custom_data object against field definitions."""
    existing = dict(existing or {})
    definitions = load_active_definitions(company, entity)
    by_key = {row.key: row for row in definitions}

    if incoming is None:
        if creating:
            incoming = {}
        else:
            return existing

    if not isinstance(incoming, dict):
        invalid(field_prefix, "Send custom field values as an object.")

    ensure_flat_payload(incoming, field_prefix)

    for key in incoming:
        if key not in by_key:
            invalid(f"{field_prefix}.{key}", "That custom field is not defined.")

    if permission_codes is not None:
        assert_writable_custom_keys(
            definitions,
            incoming,
            entity=entity,
            permission_codes=permission_codes,
            is_self=is_self,
            field_prefix=field_prefix,
        )

    # Retain values for archived / deleted definitions.
    result = {key: value for key, value in existing.items() if key not in by_key}

    for definition in definitions:
        path = f"{field_prefix}.{definition.key}"
        if definition.key in incoming:
            normalized = normalize_value(definition, incoming[definition.key], path)
            if definition.required and normalized is None:
                invalid(path, f"{definition.name} is required.")
            if normalized is not None:
                result[definition.key] = normalized
        elif creating:
            if definition.required:
                invalid(path, f"{definition.name} is required.")
        elif definition.key in existing:
            result[definition.key] = existing[definition.key]

    return result
