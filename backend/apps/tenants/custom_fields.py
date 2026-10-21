import re

from django.db import IntegrityError, transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditLog
from apps.authorization.company import require_permission
from apps.tenants.models import CustomField, FieldEntity, FieldType
from apps.tenants.services import _ip, _request_id
from common.api.errors import conflict, not_found, validation_error

_KEY = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_ENTITIES = {choice.value for choice in FieldEntity}
_TYPES = {choice.value for choice in FieldType}


def _invalid(field, message):
    raise validation_error([{"field": field, "code": "invalid", "message": message}], message=message)


def _slug(name: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")[:64]
    if not text or not _KEY.match(text):
        _invalid("name", "Use a field name with letters or numbers.")
    return text


def _payload(row: CustomField) -> dict:
    return {
        "id": str(row.id),
        "entity": row.entity,
        "name": row.name,
        "key": row.key,
        "field_type": row.field_type,
        "required": row.required,
        "sensitive": row.sensitive,
        "self_editable": row.self_editable,
        "filterable": row.filterable,
        "options": list(row.options or []),
        "position": row.position,
    }


def list_fields(company, entity: str):
    if entity not in _ENTITIES:
        _invalid("entity", "Choose a record type.")
    return [_payload(row) for row in CustomField.objects.filter(company=company, entity=entity)]


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
    options = payload.get("options") or []
    if field_type in {FieldType.SELECT, FieldType.MULTI_SELECT}:
        if not isinstance(options, list) or not options or not all(isinstance(item, str) and item.strip() for item in options):
            _invalid("options", "Enter at least one option.")
        options = [item.strip()[:150] for item in options]
    else:
        options = []
    flags = {}
    for key, default in (("required", False), ("sensitive", False), ("self_editable", True), ("filterable", False)):
        value = payload.get(key, default)
        if not isinstance(value, bool):
            _invalid(key, "Choose on or off.")
        flags[key] = value
    key = _slug(name)
    position = CustomField.objects.filter(company=company, entity=entity).count()
    try:
        with transaction.atomic():
            row = CustomField.objects.create(
                company=company,
                entity=entity,
                name=name,
                key=key,
                field_type=field_type,
                options=options,
                position=position,
                **flags,
            )
    except IntegrityError as exc:
        raise conflict("That field name is already used on this record.", [{"field": "name", "code": "duplicate", "message": "That field name is already used on this record."}]) from exc
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


def delete_field(request, company, field_id):
    row = CustomField.objects.filter(company=company, pk=field_id).first()
    if row is None:
        raise not_found("That field was not found.")
    before = _payload(row)
    row.delete()
    AuditLog.objects.create(
        company=company,
        actor=request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
        action="custom_field.deleted",
        object_type="custom_field",
        object_id=field_id,
        before=before,
        ip_address=_ip(request),
        request_id=_request_id(request),
    )


class CustomFieldListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "company.view")
        entity = request.query_params.get("entity") or FieldEntity.PERSON
        return Response({"results": list_fields(membership.company, entity)})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "company.update")
        row = create_field(request, membership.company, request.data)
        return Response(_payload(row), status=201)


class CustomFieldDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, company_id, field_id):
        membership = require_permission(request.user, company_id, "company.update")
        delete_field(request, membership.company, field_id)
        return Response(status=204)
