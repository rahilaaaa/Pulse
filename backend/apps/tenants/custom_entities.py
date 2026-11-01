"""Custom entity definitions, fields, and company-scoped records."""

from __future__ import annotations

import re

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditLog
from apps.authorization.company import effective_permission_codes, require_permission
from apps.tenants.custom_data_access import (
    apply_json_filters,
    parse_custom_filters,
    serialize_custom_data,
)
from apps.tenants.field_types import (
    SLUG_RE,
    ensure_flat_payload,
    extract_validation_raw,
    invalid,
    merge_field_config,
    normalize_value,
    options_list,
    reference_config,
)
from apps.tenants.models import (
    CustomEntity,
    CustomEntityField,
    CustomEntityRecord,
    FieldStatus,
    FieldType,
)
from apps.tenants.services import _ip, _request_id
from common.api.errors import conflict, not_found

MAX_ENTITIES_PER_COMPANY = 20
MAX_FIELDS_PER_ENTITY = 50
MAX_RECORDS_PER_ENTITY = 10_000
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

RESERVED_ENTITY_KEYS = {
    "user",
    "company",
    "membership",
    "invitation",
    "person",
    "billing",
    "subscription",
    "role",
    "permission",
    "audit",
    "module",
    "invoice",
    "department",
    "organization-unit",
    "organization_unit",
    "task",
    "custom-entity",
    "custom_entity",
}

RESERVED_FIELD_KEYS = {
    "id",
    "company",
    "company_id",
    "entity",
    "entity_id",
    "data",
    "created_at",
    "updated_at",
    "archived_at",
    "created_by",
    "updated_by",
}


def _slug_from_name(name: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")[:64]
    if not text or not SLUG_RE.match(text):
        invalid("name", "Use a name with letters or numbers.")
    return text


def _unique_entity_key(company, base: str) -> str:
    key = base[:64]
    if not CustomEntity.objects.filter(company=company, key=key).exists():
        return key
    for number in range(2, 1000):
        suffix = f"-{number}"
        candidate = f"{base[: 64 - len(suffix)]}{suffix}"
        if not CustomEntity.objects.filter(company=company, key=candidate).exists():
            return candidate
    invalid("name", "Could not generate a unique entity key.")


def _unique_field_key(entity, base: str) -> str:
    key = base[:64]
    if not CustomEntityField.objects.filter(entity=entity, key=key).exists():
        return key
    for number in range(2, 1000):
        suffix = f"-{number}"
        candidate = f"{base[: 64 - len(suffix)]}{suffix}"
        if not CustomEntityField.objects.filter(entity=entity, key=candidate).exists():
            return candidate
    invalid("name", "Could not generate a unique field key.")


def _flags(payload, *, defaults=None):
    defaults = defaults or {}
    flags = {}
    for key, default in (
        ("required", defaults.get("required", False)),
        ("sensitive", defaults.get("sensitive", False)),
        ("self_editable", defaults.get("self_editable", True)),
        ("filterable", defaults.get("filterable", False)),
        ("is_primary", defaults.get("is_primary", False)),
    ):
        if key not in payload and key in defaults:
            flags[key] = defaults[key]
            continue
        value = payload.get(key, default)
        if not isinstance(value, bool):
            invalid(key, "Choose on or off.")
        flags[key] = value
    return flags


def _entity_payload(row: CustomEntity) -> dict:
    return {
        "id": str(row.id),
        "key": row.key,
        "name": row.name,
        "description": row.description or "",
        "status": row.status,
        "schema_version": row.schema_version,
        "archived_at": row.archived_at.isoformat() if row.archived_at else None,
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
        "field_count": getattr(row, "field_count", None),
    }


def _field_payload(row: CustomEntityField) -> dict:
    return {
        "id": str(row.id),
        "entity_id": str(row.entity_id),
        "name": row.name,
        "key": row.key,
        "field_type": row.field_type,
        "help_text": row.help_text or "",
        "required": row.required,
        "sensitive": row.sensitive,
        "self_editable": row.self_editable,
        "filterable": row.filterable,
        "is_primary": row.is_primary,
        "options": list(row.options or []),
        "config": dict(row.config or {}),
        "position": row.position,
        "status": row.status,
        "archived_at": row.archived_at.isoformat() if row.archived_at else None,
    }


def _record_payload(row: CustomEntityRecord, fields: list[CustomEntityField], permission_codes) -> dict:
    return {
        "id": str(row.id),
        "entity_id": str(row.entity_id),
        "data": serialize_custom_data(
            fields,
            row.data or {},
            entity="custom_entity",
            permission_codes=permission_codes,
        ),
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
        "archived_at": row.archived_at.isoformat() if row.archived_at else None,
    }


def _get_entity(company, entity_id, *, allow_archived=False) -> CustomEntity:
    row = CustomEntity.objects.filter(company=company, pk=entity_id).first()
    if row is None:
        raise not_found("That custom entity was not found.")
    if not allow_archived and row.status == FieldStatus.ARCHIVED:
        raise conflict("That custom entity is archived.")
    return row


def _active_fields(entity: CustomEntity) -> list[CustomEntityField]:
    return list(
        CustomEntityField.objects.filter(entity=entity, status=FieldStatus.ACTIVE).order_by("position", "name")
    )


def normalize_record_data(entity: CustomEntity, incoming, *, creating: bool, existing=None, permission_codes=None):
    existing = dict(existing or {})
    definitions = _active_fields(entity)
    by_key = {row.key: row for row in definitions}
    if incoming is None:
        if creating:
            incoming = {}
        else:
            return existing
    if not isinstance(incoming, dict):
        invalid("data", "Send field values as an object.")
    ensure_flat_payload(incoming, "data")
    for key in incoming:
        if key not in by_key:
            invalid(f"data.{key}", "That field is not defined.")
    if permission_codes is not None:
        # Sensitive writes require custom_entities.manage
        elevated = "custom_entities.manage" in set(permission_codes)
        for key in incoming:
            definition = by_key[key]
            if definition.sensitive and not elevated:
                invalid(f"data.{key}", "You do not have permission to edit this field.")
    result = {key: value for key, value in existing.items() if key not in by_key}
    for definition in definitions:
        path = f"data.{definition.key}"
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


# --- Entity CRUD ---


def list_entities(company, *, include_archived=False):
    rows = CustomEntity.objects.filter(company=company)
    if not include_archived:
        rows = rows.filter(status=FieldStatus.ACTIVE)
    return [_entity_payload(row) for row in rows.order_by("name")]


def create_entity(request, company, payload):
    if not isinstance(payload, dict):
        invalid("", "Send a JSON object.")
    if CustomEntity.objects.filter(company=company).count() >= MAX_ENTITIES_PER_COMPANY:
        raise conflict(f"Companies may define at most {MAX_ENTITIES_PER_COMPANY} custom entities.")
    name = payload.get("name")
    if not isinstance(name, str) or not name.strip():
        invalid("name", "Enter an entity name.")
    name = name.strip()[:150]
    description = payload.get("description", "")
    if description is None:
        description = ""
    if not isinstance(description, str):
        invalid("description", "Enter a description as text.")
    description = description.strip()[:500]
    key = payload.get("key")
    if isinstance(key, str) and key.strip():
        key = key.strip().lower()
        if not SLUG_RE.match(key):
            invalid("key", "Use letters, numbers, and hyphens.")
    else:
        key = _unique_entity_key(company, _slug_from_name(name))
    if key in RESERVED_ENTITY_KEYS:
        invalid("key", "That entity key is reserved.")
    try:
        row = CustomEntity.objects.create(company=company, key=key, name=name, description=description)
    except IntegrityError as exc:
        raise conflict(
            "That entity key is already used.",
            [{"field": "key", "code": "duplicate", "message": "That entity key is already used."}],
        ) from exc
    AuditLog.objects.create(
        company=company,
        actor=request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
        action="custom_entity.created",
        object_type="custom_entity",
        object_id=row.id,
        after=_entity_payload(row),
        ip_address=_ip(request),
        request_id=_request_id(request),
    )
    return row


def update_entity(request, company, entity_id, payload):
    if not isinstance(payload, dict):
        invalid("", "Send a JSON object.")
    row = _get_entity(company, entity_id, allow_archived=True)
    if row.status == FieldStatus.ARCHIVED:
        raise conflict("Archived entities cannot be edited.")
    before = _entity_payload(row)
    if "key" in payload and payload.get("key") != row.key:
        invalid("key", "The API key cannot be changed.")
    if "name" in payload:
        name = payload.get("name")
        if not isinstance(name, str) or not name.strip():
            invalid("name", "Enter an entity name.")
        row.name = name.strip()[:150]
    if "description" in payload:
        description = payload.get("description")
        if description is None:
            description = ""
        if not isinstance(description, str):
            invalid("description", "Enter a description as text.")
        row.description = description.strip()[:500]
    row.save()
    AuditLog.objects.create(
        company=company,
        actor=request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
        action="custom_entity.updated",
        object_type="custom_entity",
        object_id=row.id,
        before=before,
        after=_entity_payload(row),
        ip_address=_ip(request),
        request_id=_request_id(request),
    )
    return row


def archive_entity(request, company, entity_id):
    row = _get_entity(company, entity_id, allow_archived=True)
    if row.status == FieldStatus.ARCHIVED:
        return row
    before = _entity_payload(row)
    row.status = FieldStatus.ARCHIVED
    row.archived_at = timezone.now()
    row.save(update_fields=["status", "archived_at", "updated_at"])
    AuditLog.objects.create(
        company=company,
        actor=request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
        action="custom_entity.archived",
        object_type="custom_entity",
        object_id=row.id,
        before=before,
        after=_entity_payload(row),
        ip_address=_ip(request),
        request_id=_request_id(request),
    )
    return row


# --- Field CRUD ---


def list_fields(company, entity_id, *, include_archived=False):
    entity = _get_entity(company, entity_id, allow_archived=True)
    rows = CustomEntityField.objects.filter(entity=entity, company=company)
    if not include_archived:
        rows = rows.filter(status=FieldStatus.ACTIVE)
    return [_field_payload(row) for row in rows.order_by("position", "name")]


def create_field(request, company, entity_id, payload):
    if not isinstance(payload, dict):
        invalid("", "Send a JSON object.")
    entity = _get_entity(company, entity_id)
    if CustomEntityField.objects.filter(entity=entity).count() >= MAX_FIELDS_PER_ENTITY:
        raise conflict(f"Entities may define at most {MAX_FIELDS_PER_ENTITY} fields.")
    name = payload.get("name")
    if not isinstance(name, str) or not name.strip():
        invalid("name", "Enter a field name.")
    name = name.strip()[:150]
    field_type = payload.get("field_type") or FieldType.TEXT
    if field_type not in {choice.value for choice in FieldType}:
        invalid("field_type", "Choose a field type.")
    options = options_list(field_type, payload.get("options") or [])
    cfg_payload = dict(payload)
    cfg_payload["_company_id"] = str(company.id)
    validation_raw, has_validation = extract_validation_raw(payload)
    if field_type == FieldType.REFERENCE:
        config = reference_config(cfg_payload)
        if has_validation and validation_raw:
            merge_field_config(field_type, validation_raw=validation_raw, has_validation=True)
    else:
        config = merge_field_config(
            field_type,
            base={},
            validation_raw=validation_raw,
            has_validation=has_validation,
        )
    flags = _flags(payload)
    help_text = payload.get("help_text", "") or ""
    if not isinstance(help_text, str):
        invalid("help_text", "Enter help text as a string.")
    help_text = help_text.strip()[:255]
    key = _unique_field_key(entity, _slug_from_name(name))
    if key in RESERVED_FIELD_KEYS:
        invalid("name", "That field key is reserved.")
    if flags["is_primary"]:
        if field_type != FieldType.TEXT:
            invalid("is_primary", "The primary field must be a text field.")
        CustomEntityField.objects.filter(entity=entity, is_primary=True).update(is_primary=False)
    position = CustomEntityField.objects.filter(entity=entity).count()
    try:
        with transaction.atomic():
            row = CustomEntityField.objects.create(
                company=company,
                entity=entity,
                name=name,
                key=key,
                field_type=field_type,
                help_text=help_text,
                options=options,
                config=config,
                position=position,
                **flags,
            )
            entity.schema_version += 1
            entity.save(update_fields=["schema_version", "updated_at"])
    except IntegrityError as exc:
        raise conflict(
            "That field key is already used.",
            [{"field": "name", "code": "duplicate", "message": "That field key is already used."}],
        ) from exc
    AuditLog.objects.create(
        company=company,
        actor=request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
        action="custom_entity_field.created",
        object_type="custom_entity_field",
        object_id=row.id,
        after=_field_payload(row),
        ip_address=_ip(request),
        request_id=_request_id(request),
    )
    return row


def update_field(request, company, entity_id, field_id, payload):
    if not isinstance(payload, dict):
        invalid("", "Send a JSON object.")
    entity = _get_entity(company, entity_id)
    row = CustomEntityField.objects.filter(company=company, entity=entity, pk=field_id).first()
    if row is None:
        raise not_found("That field was not found.")
    if row.status == FieldStatus.ARCHIVED:
        raise conflict("Archived fields cannot be edited.")
    before = _field_payload(row)
    if "key" in payload and payload.get("key") != row.key:
        invalid("key", "The API key cannot be changed.")
    if "field_type" in payload and payload.get("field_type") != row.field_type:
        invalid("field_type", "The field type cannot be changed after creation.")
    if "name" in payload:
        name = payload.get("name")
        if not isinstance(name, str) or not name.strip():
            invalid("name", "Enter a field name.")
        row.name = name.strip()[:150]
    if "help_text" in payload:
        help_text = payload.get("help_text") or ""
        if not isinstance(help_text, str):
            invalid("help_text", "Enter help text as a string.")
        row.help_text = help_text.strip()[:255]
    if "options" in payload:
        row.options = options_list(row.field_type, payload.get("options") or [])
    if row.field_type == FieldType.REFERENCE and "config" in payload:
        cfg_payload = dict(payload)
        cfg_payload["_company_id"] = str(company.id)
        existing = dict(row.config or {})
        existing["_company_id"] = str(company.id)
        row.config = reference_config(cfg_payload, existing=existing)
    validation_raw, has_validation = extract_validation_raw(payload)
    if has_validation:
        if row.field_type == FieldType.REFERENCE and validation_raw:
            merge_field_config(row.field_type, validation_raw=validation_raw, has_validation=True)
        elif row.field_type != FieldType.REFERENCE:
            base = dict(row.config or {})
            row.config = merge_field_config(
                row.field_type,
                base=base,
                validation_raw=validation_raw,
                has_validation=True,
            )
    if any(key in payload for key in ("required", "sensitive", "self_editable", "filterable", "is_primary")):
        flags = _flags(
            payload,
            defaults={
                "required": row.required,
                "sensitive": row.sensitive,
                "self_editable": row.self_editable,
                "filterable": row.filterable,
                "is_primary": row.is_primary,
            },
        )
        if flags["is_primary"] and row.field_type != FieldType.TEXT:
            invalid("is_primary", "The primary field must be a text field.")
        if flags["is_primary"]:
            CustomEntityField.objects.filter(entity=entity, is_primary=True).exclude(pk=row.pk).update(is_primary=False)
        row.required = flags["required"]
        row.sensitive = flags["sensitive"]
        row.self_editable = flags["self_editable"]
        row.filterable = flags["filterable"]
        row.is_primary = flags["is_primary"]
    if "position" in payload:
        position = payload.get("position")
        if not isinstance(position, int) or isinstance(position, bool) or position < 0:
            invalid("position", "Enter a non-negative position.")
        row.position = position
    row.save()
    AuditLog.objects.create(
        company=company,
        actor=request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
        action="custom_entity_field.updated",
        object_type="custom_entity_field",
        object_id=row.id,
        before=before,
        after=_field_payload(row),
        ip_address=_ip(request),
        request_id=_request_id(request),
    )
    return row


def archive_field(request, company, entity_id, field_id):
    entity = _get_entity(company, entity_id)
    row = CustomEntityField.objects.filter(company=company, entity=entity, pk=field_id).first()
    if row is None:
        raise not_found("That field was not found.")
    if row.status == FieldStatus.ARCHIVED:
        return row
    before = _field_payload(row)
    row.status = FieldStatus.ARCHIVED
    row.archived_at = timezone.now()
    row.is_primary = False
    row.save(update_fields=["status", "archived_at", "is_primary", "updated_at"])
    entity.schema_version += 1
    entity.save(update_fields=["schema_version", "updated_at"])
    AuditLog.objects.create(
        company=company,
        actor=request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
        action="custom_entity_field.archived",
        object_type="custom_entity_field",
        object_id=row.id,
        before=before,
        after=_field_payload(row),
        ip_address=_ip(request),
        request_id=_request_id(request),
    )
    return row


# --- Record CRUD ---


def list_records(request, company, entity_id, *, permission_codes):
    entity = _get_entity(company, entity_id)
    fields = _active_fields(entity)
    filters = parse_custom_filters(
        request.query_params,
        fields,
        entity="custom_entity",
        permission_codes=permission_codes,
    )
    qs = CustomEntityRecord.objects.filter(company=company, entity=entity, archived_at__isnull=True)
    qs = apply_json_filters(qs, filters, json_field="data")
    q = (request.query_params.get("q") or "").strip()
    if q:
        primary = next((f for f in fields if f.is_primary), None)
        if primary is not None:
            qs = qs.filter(**{f"data__{primary.key}__icontains": q})
        else:
            text_keys = [f.key for f in fields if f.field_type in {FieldType.TEXT, FieldType.LONG_TEXT}]
            clause = Q()
            for key in text_keys:
                clause |= Q(**{f"data__{key}__icontains": q})
            if clause:
                qs = qs.filter(clause)
    try:
        page = max(int(request.query_params.get("page") or 1), 1)
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(max(int(request.query_params.get("page_size") or DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE)
    except (TypeError, ValueError):
        page_size = DEFAULT_PAGE_SIZE
    total = qs.count()
    offset = (page - 1) * page_size
    rows = list(qs.order_by("-created_at")[offset : offset + page_size])
    results = [_record_payload(row, fields, permission_codes) for row in rows]
    return {"results": results, "count": total, "page": page, "page_size": page_size}


def create_record(request, company, entity_id, payload, *, permission_codes):
    entity = _get_entity(company, entity_id)
    if CustomEntityRecord.objects.filter(company=company, entity=entity, archived_at__isnull=True).count() >= MAX_RECORDS_PER_ENTITY:
        raise conflict(f"Entities may hold at most {MAX_RECORDS_PER_ENTITY} records.")
    if not isinstance(payload, dict):
        invalid("", "Send a JSON object.")
    data = normalize_record_data(
        entity,
        payload.get("data") if "data" in payload else None,
        creating=True,
        existing={},
        permission_codes=permission_codes,
    )
    row = CustomEntityRecord.objects.create(
        company=company,
        entity=entity,
        data=data,
        created_by=request.user if request.user.is_authenticated else None,
        updated_by=request.user if request.user.is_authenticated else None,
    )
    fields = _active_fields(entity)
    AuditLog.objects.create(
        company=company,
        actor=request.user if request.user.is_authenticated else None,
        action="custom_entity_record.created",
        object_type="custom_entity_record",
        object_id=row.id,
        after={"data": data},
        ip_address=_ip(request),
        request_id=_request_id(request),
    )
    return _record_payload(row, fields, permission_codes)


def update_record(request, company, entity_id, record_id, payload, *, permission_codes):
    entity = _get_entity(company, entity_id)
    if not isinstance(payload, dict):
        invalid("", "Send a JSON object.")
    row = CustomEntityRecord.objects.filter(company=company, entity=entity, pk=record_id).first()
    if row is None:
        raise not_found("That record was not found.")
    if row.archived_at is not None:
        raise conflict("Archived records cannot be edited.")
    before = dict(row.data or {})
    row.data = normalize_record_data(
        entity,
        payload.get("data") if "data" in payload else None,
        creating=False,
        existing=row.data or {},
        permission_codes=permission_codes,
    )
    row.updated_by = request.user if request.user.is_authenticated else None
    row.save(update_fields=["data", "updated_by", "updated_at"])
    fields = _active_fields(entity)
    AuditLog.objects.create(
        company=company,
        actor=request.user if request.user.is_authenticated else None,
        action="custom_entity_record.updated",
        object_type="custom_entity_record",
        object_id=row.id,
        before={"data": before},
        after={"data": dict(row.data or {})},
        ip_address=_ip(request),
        request_id=_request_id(request),
    )
    return _record_payload(row, fields, permission_codes)


def archive_record(request, company, entity_id, record_id):
    entity = _get_entity(company, entity_id)
    row = CustomEntityRecord.objects.filter(company=company, entity=entity, pk=record_id).first()
    if row is None:
        raise not_found("That record was not found.")
    if row.archived_at is not None:
        return row
    before = dict(row.data or {})
    row.archived_at = timezone.now()
    row.updated_by = request.user if request.user.is_authenticated else None
    row.save(update_fields=["archived_at", "updated_by", "updated_at"])
    AuditLog.objects.create(
        company=company,
        actor=request.user if request.user.is_authenticated else None,
        action="custom_entity_record.archived",
        object_type="custom_entity_record",
        object_id=row.id,
        before={"data": before, "archived_at": None},
        after={"data": before, "archived_at": row.archived_at.isoformat()},
        ip_address=_ip(request),
        request_id=_request_id(request),
    )
    return row


# --- Views ---


class CustomEntityListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "custom_entities.view")
        include_archived = str(request.query_params.get("include_archived") or "").lower() in {"1", "true", "yes"}
        # manage also sees archived when requested; view sees active
        if include_archived and "custom_entities.manage" not in effective_permission_codes(membership):
            include_archived = False
        return Response({"results": list_entities(membership.company, include_archived=include_archived)})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "custom_entities.manage")
        row = create_entity(request, membership.company, request.data)
        return Response(_entity_payload(row), status=201)


class CustomEntityDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, entity_id):
        membership = require_permission(request.user, company_id, "custom_entities.view")
        row = _get_entity(membership.company, entity_id, allow_archived=True)
        return Response(_entity_payload(row))

    def patch(self, request, company_id, entity_id):
        membership = require_permission(request.user, company_id, "custom_entities.manage")
        row = update_entity(request, membership.company, entity_id, request.data)
        return Response(_entity_payload(row))

    def delete(self, request, company_id, entity_id):
        membership = require_permission(request.user, company_id, "custom_entities.manage")
        row = archive_entity(request, membership.company, entity_id)
        return Response(_entity_payload(row))


class CustomEntityFieldListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, entity_id):
        membership = require_permission(request.user, company_id, "custom_entities.view")
        include_archived = str(request.query_params.get("include_archived") or "").lower() in {"1", "true", "yes"}
        if include_archived and "custom_entities.manage" not in effective_permission_codes(membership):
            include_archived = False
        return Response({"results": list_fields(membership.company, entity_id, include_archived=include_archived)})

    def post(self, request, company_id, entity_id):
        membership = require_permission(request.user, company_id, "custom_entities.manage")
        row = create_field(request, membership.company, entity_id, request.data)
        return Response(_field_payload(row), status=201)


class CustomEntityFieldDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, company_id, entity_id, field_id):
        membership = require_permission(request.user, company_id, "custom_entities.manage")
        row = update_field(request, membership.company, entity_id, field_id, request.data)
        return Response(_field_payload(row))

    def delete(self, request, company_id, entity_id, field_id):
        membership = require_permission(request.user, company_id, "custom_entities.manage")
        row = archive_field(request, membership.company, entity_id, field_id)
        return Response(_field_payload(row))


class CustomEntityRecordListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, entity_id):
        membership = require_permission(request.user, company_id, "custom_entities.view")
        codes = effective_permission_codes(membership)
        return Response(list_records(request, membership.company, entity_id, permission_codes=codes))

    def post(self, request, company_id, entity_id):
        membership = require_permission(request.user, company_id, "custom_entities.create")
        codes = effective_permission_codes(membership)
        return Response(
            create_record(request, membership.company, entity_id, request.data, permission_codes=codes),
            status=201,
        )


class CustomEntityRecordDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, entity_id, record_id):
        membership = require_permission(request.user, company_id, "custom_entities.view")
        codes = effective_permission_codes(membership)
        entity = _get_entity(membership.company, entity_id, allow_archived=True)
        row = CustomEntityRecord.objects.filter(company=membership.company, entity=entity, pk=record_id).first()
        if row is None:
            raise not_found("That record was not found.")
        fields = _active_fields(entity)
        return Response(_record_payload(row, fields, codes))

    def patch(self, request, company_id, entity_id, record_id):
        membership = require_permission(request.user, company_id, "custom_entities.update")
        codes = effective_permission_codes(membership)
        return Response(
            update_record(request, membership.company, entity_id, record_id, request.data, permission_codes=codes)
        )

    def delete(self, request, company_id, entity_id, record_id):
        membership = require_permission(request.user, company_id, "custom_entities.delete")
        codes = effective_permission_codes(membership)
        row = archive_record(request, membership.company, entity_id, record_id)
        fields = _active_fields(_get_entity(membership.company, entity_id, allow_archived=True))
        return Response(_record_payload(row, fields, codes))
