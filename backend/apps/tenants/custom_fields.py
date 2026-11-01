import re

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditLog
from apps.authorization.company import effective_permission_codes, require_membership, require_permission
from apps.tenants.custom_data_access import normalize_custom_data as normalize_custom_data_access
from apps.tenants.field_types import (
    REFERENCE_TARGETS,
    extract_validation_raw,
    merge_field_config,
    options_list,
    reference_config,
)
from apps.tenants.models import CustomField, FieldEntity, FieldStatus, FieldType
from apps.tenants.services import _ip, _request_id
from common.api.errors import conflict, not_found, validation_error

_KEY = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_ENTITIES = {choice.value for choice in FieldEntity}
_TYPES = {choice.value for choice in FieldType}

RESERVED_KEYS = {
    FieldEntity.ORGANIZATION_UNIT: {
        "id",
        "company",
        "company_id",
        "name",
        "key",
        "description",
        "status",
        "parent",
        "parent_id",
        "unit_type",
        "unit_type_id",
        "manager",
        "manager_id",
        "member_count",
        "custom_data",
        "created_at",
        "updated_at",
        "people",
        "members",
    },
    FieldEntity.PERSON: {
        "id",
        "company",
        "company_id",
        "department",
        "department_id",
        "first_name",
        "last_name",
        "work_email",
        "job_title",
        "status",
        "custom_data",
        "created_at",
        "updated_at",
        "deactivated_at",
    },
    FieldEntity.COMPANY: {
        "id",
        "slug",
        "legal_name",
        "display_name",
        "status",
        "country_code",
        "timezone",
        "custom_data",
        "created_at",
        "updated_at",
    },
    FieldEntity.TASK: {
        "id",
        "company",
        "company_id",
        "custom_data",
        "created_at",
        "updated_at",
    },
    FieldEntity.INVITATION: {
        "id",
        "company",
        "company-id",
        "company_id",
        "email",
        "status",
        "token-hash",
        "token_hash",
        "token",
        "invited-by",
        "invited_by",
        "invited-by-id",
        "invited_by_id",
        "accepted-by",
        "accepted_by",
        "accepted-by-id",
        "accepted_by_id",
        "accepted-at",
        "accepted_at",
        "expires-at",
        "expires_at",
        "custom-data",
        "custom_data",
        "created-at",
        "created_at",
        "updated-at",
        "updated_at",
    },
    FieldEntity.MEMBERSHIP: {
        "id",
        "company",
        "company-id",
        "company_id",
        "user",
        "user-id",
        "user_id",
        "person",
        "person-id",
        "person_id",
        "status",
        "joined-at",
        "joined_at",
        "removed-at",
        "removed_at",
        "custom-data",
        "custom_data",
        "created-at",
        "created_at",
        "updated-at",
        "updated_at",
        "roles",
        "email",
    },
}


def _invalid(field, message):
    raise validation_error([{"field": field, "code": "invalid", "message": message}], message=message)


def _slug(name: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")[:64]
    if not text or not _KEY.match(text):
        _invalid("name", "Use a field name with letters or numbers.")
    return text


def _unique_key(company, entity: str, base: str) -> str:
    key = base[:64]
    if not CustomField.objects.filter(company=company, entity=entity, key=key).exists():
        return key
    for number in range(2, 1000):
        suffix = f"-{number}"
        candidate = f"{base[: 64 - len(suffix)]}{suffix}"
        if not CustomField.objects.filter(company=company, entity=entity, key=candidate).exists():
            return candidate
    _invalid("name", "Could not generate a unique field key.")


def _reference_config(payload, *, existing=None, company=None):
    data = dict(payload)
    if company is not None:
        data["_company_id"] = str(company.id)
    existing_cfg = dict(existing or {})
    if company is not None:
        existing_cfg["_company_id"] = str(company.id)
    return reference_config(data, existing=existing_cfg if existing is not None else None, allow_custom_entity=True)


def list_reference_targets(membership) -> list[dict]:
    codes = effective_permission_codes(membership)
    results = []
    for key, meta in REFERENCE_TARGETS.items():
        if meta["permission"] not in codes:
            continue
        if key == "custom_entity":
            from apps.tenants.models import CustomEntity

            for entity in CustomEntity.objects.filter(company=membership.company, status=FieldStatus.ACTIVE).order_by("name"):
                results.append(
                    {
                        "id": f"custom_entity:{entity.id}",
                        "label": f"{entity.name} records",
                        "target": "custom_entity",
                        "entity_id": str(entity.id),
                    }
                )
            continue
        results.append({"id": key, "label": meta["label"], "target": key})
    return results


def _flags(payload, *, defaults=None):
    defaults = defaults or {}
    flags = {}
    for key, default in (
        ("required", defaults.get("required", False)),
        ("sensitive", defaults.get("sensitive", False)),
        ("self_editable", defaults.get("self_editable", True)),
        ("filterable", defaults.get("filterable", False)),
    ):
        if key not in payload and key in defaults:
            flags[key] = defaults[key]
            continue
        value = payload.get(key, default)
        if not isinstance(value, bool):
            _invalid(key, "Choose on or off.")
        flags[key] = value
    return flags


def _payload(row: CustomField) -> dict:
    return {
        "id": str(row.id),
        "entity": row.entity,
        "name": row.name,
        "key": row.key,
        "field_type": row.field_type,
        "help_text": row.help_text or "",
        "required": row.required,
        "sensitive": row.sensitive,
        "self_editable": row.self_editable,
        "filterable": row.filterable,
        "options": list(row.options or []),
        "config": dict(row.config or {}),
        "position": row.position,
        "status": row.status,
        "archived_at": row.archived_at.isoformat() if row.archived_at else None,
    }


def list_fields(company, entity: str, *, include_archived: bool = False):
    if entity not in _ENTITIES:
        _invalid("entity", "Choose a record type.")
    rows = CustomField.objects.filter(company=company, entity=entity)
    if not include_archived:
        rows = rows.filter(status=FieldStatus.ACTIVE)
    return [_payload(row) for row in rows.order_by("position", "name")]


def create_field(request, company, payload):
    if not isinstance(payload, dict):
        _invalid("", "Send a JSON object.")
    entity = payload.get("entity")
    if entity not in _ENTITIES:
        _invalid("entity", "Choose a record type.")
    name = payload.get("name")
    if not isinstance(name, str) or not name.strip():
        _invalid("name", "Enter a field name.")
    name = name.strip()[:150]
    field_type = payload.get("field_type") or FieldType.TEXT
    if field_type not in _TYPES:
        _invalid("field_type", "Choose a field type.")
    options = options_list(field_type, payload.get("options") or [])
    validation_raw, has_validation = extract_validation_raw(payload)
    if field_type == FieldType.REFERENCE:
        config = _reference_config(payload, company=company)
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
    help_text = payload.get("help_text", "")
    if help_text is None:
        help_text = ""
    if not isinstance(help_text, str):
        _invalid("help_text", "Enter help text as a string.")
    help_text = help_text.strip()[:255]
    key = _unique_key(company, entity, _slug(name))
    reserved = RESERVED_KEYS.get(entity, set())
    if key in reserved:
        _invalid("name", "That field key is reserved for a system field.")
    position = CustomField.objects.filter(company=company, entity=entity).count()
    try:
        with transaction.atomic():
            row = CustomField.objects.create(
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
    except IntegrityError as exc:
        raise conflict(
            "That field key is already used on this record.",
            [{"field": "name", "code": "duplicate", "message": "That field key is already used on this record."}],
        ) from exc
    AuditLog.objects.create(
        company=company,
        actor=request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
        action="custom_field.created",
        object_type="custom_field",
        object_id=row.id,
        after=_payload(row),
        ip_address=_ip(request),
        request_id=_request_id(request),
    )
    return row


def update_field(request, company, field_id, payload):
    if not isinstance(payload, dict):
        _invalid("", "Send a JSON object.")
    row = CustomField.objects.filter(company=company, pk=field_id).first()
    if row is None:
        raise not_found("That field was not found.")
    if row.status == FieldStatus.ARCHIVED:
        raise conflict("Archived fields cannot be edited.")
    before = _payload(row)
    if "entity" in payload and payload.get("entity") != row.entity:
        _invalid("entity", "The record type cannot be changed.")
    if "key" in payload and payload.get("key") != row.key:
        _invalid("key", "The API key cannot be changed.")
    if "field_type" in payload and payload.get("field_type") != row.field_type:
        _invalid("field_type", "The field type cannot be changed after creation.")
    if "name" in payload:
        name = payload.get("name")
        if not isinstance(name, str) or not name.strip():
            _invalid("name", "Enter a field name.")
        row.name = name.strip()[:150]
    if "help_text" in payload:
        help_text = payload.get("help_text")
        if help_text is None:
            help_text = ""
        if not isinstance(help_text, str):
            _invalid("help_text", "Enter help text as a string.")
        row.help_text = help_text.strip()[:255]
    if "options" in payload:
        row.options = options_list(row.field_type, payload.get("options") or [])
    if row.field_type == FieldType.REFERENCE and "config" in payload:
        row.config = _reference_config(payload, existing=row.config or {}, company=company)
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
    if any(key in payload for key in ("required", "sensitive", "self_editable", "filterable")):
        flags = _flags(
            payload,
            defaults={
                "required": row.required,
                "sensitive": row.sensitive,
                "self_editable": row.self_editable,
                "filterable": row.filterable,
            },
        )
        row.required = flags["required"]
        row.sensitive = flags["sensitive"]
        row.self_editable = flags["self_editable"]
        row.filterable = flags["filterable"]
    if "position" in payload:
        position = payload.get("position")
        if not isinstance(position, int) or isinstance(position, bool) or position < 0:
            _invalid("position", "Enter a non-negative position.")
        row.position = position
    row.save()
    AuditLog.objects.create(
        company=company,
        actor=request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
        action="custom_field.updated",
        object_type="custom_field",
        object_id=row.id,
        before=before,
        after=_payload(row),
        ip_address=_ip(request),
        request_id=_request_id(request),
    )
    return row


def delete_field(request, company, field_id):
    row = CustomField.objects.filter(company=company, pk=field_id).first()
    if row is None:
        raise not_found("That field was not found.")
    if row.status == FieldStatus.ARCHIVED:
        return row
    before = _payload(row)
    row.status = FieldStatus.ARCHIVED
    row.archived_at = timezone.now()
    row.save(update_fields=["status", "archived_at", "updated_at"])
    after = _payload(row)
    AuditLog.objects.create(
        company=company,
        actor=request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
        action="custom_field.archived",
        object_type="custom_field",
        object_id=field_id,
        before=before,
        after=after,
        ip_address=_ip(request),
        request_id=_request_id(request),
    )
    return row


def normalize_custom_data(company, entity: str, incoming, *, creating: bool, existing=None, permission_codes=None, is_self=False):
    """Validate and normalize custom_data. Re-exported for callers; uses shared access module."""
    return normalize_custom_data_access(
        company,
        entity,
        incoming,
        creating=creating,
        existing=existing,
        permission_codes=permission_codes,
        is_self=is_self,
    )


class CustomFieldListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "company.view")
        entity = request.query_params.get("entity") or FieldEntity.PERSON
        include_archived = str(request.query_params.get("include_archived") or "").lower() in {"1", "true", "yes"}
        return Response({"results": list_fields(membership.company, entity, include_archived=include_archived)})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "company.update")
        row = create_field(request, membership.company, request.data)
        return Response(_payload(row), status=201)


class ReferenceTargetListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_membership(request.user, company_id)
        return Response({"results": list_reference_targets(membership)})


class CustomFieldDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, company_id, field_id):
        membership = require_permission(request.user, company_id, "company.update")
        row = update_field(request, membership.company, field_id, request.data)
        return Response(_payload(row))

    def delete(self, request, company_id, field_id):
        membership = require_permission(request.user, company_id, "company.update")
        row = delete_field(request, membership.company, field_id)
        return Response(_payload(row), status=200)
