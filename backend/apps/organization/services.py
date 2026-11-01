import hashlib
import re
import uuid

from django.db import IntegrityError, connection, transaction
from django.db.models import Count
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.organization.models import Department, OrganizationUnitType, Person, PersonStatus, UnitStatus
from apps.tenants.custom_data_access import serialize_custom_data
from apps.tenants.custom_fields import normalize_custom_data
from apps.tenants.models import CompanyMembership, FieldEntity, MembershipStatus
from apps.tenants.services import _ip, _request_id
from common.api.errors import conflict, not_found, permission_denied, validation_error

_KEY = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _invalid(field, message):
    raise validation_error([{"field": field, "code": "invalid", "message": message}], message=message)


def normalize_key(raw, field="key"):
    if not isinstance(raw, str):
        _invalid(field, "Enter a key.")
    text = re.sub(r"[^a-z0-9]+", "-", raw.strip().lower()).strip("-")[:64]
    if not text or not _KEY.match(text):
        _invalid(field, "Use letters, numbers, and hyphens.")
    return text


def _lock_company(company_id):
    token = int(hashlib.sha256(f"organization:{company_id}".encode()).hexdigest()[:15], 16)
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_xact_lock(%s)", [token])


def _audit(request, company, action, object_type, object_id, before, after):
    AuditLog.objects.create(
        company=company,
        actor=request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
        action=action,
        object_type=object_type,
        object_id=str(object_id),
        before=before,
        after=after,
        ip_address=_ip(request),
        request_id=_request_id(request),
    )


def _type_payload(row):
    return {
        "id": str(row.id),
        "key": row.key,
        "singular_label": row.singular_label,
        "plural_label": row.plural_label,
        "icon": row.icon,
        "description": row.description,
        "is_active": row.is_active,
        "position": row.position,
        "allowed_parent_keys": list(row.allowed_parent_keys or []),
    }


def _person_name(person):
    name = f"{person.first_name} {person.last_name}".strip()
    return name or person.work_email or str(person.id)


def _unit_payload(row, *, permission_codes=None):
    manager = row.manager if row.manager_id else None
    annotated = row.__dict__.get("member_count")
    member_count = annotated if annotated is not None else (row.people.count() if row.pk else 0)
    custom_data = dict(row.custom_data or {})
    if permission_codes is not None:
        from apps.tenants.custom_data_access import load_active_definitions

        custom_data = serialize_custom_data(
            load_active_definitions(row.company, FieldEntity.ORGANIZATION_UNIT),
            custom_data,
            entity=FieldEntity.ORGANIZATION_UNIT,
            permission_codes=permission_codes,
        )
    return {
        "id": str(row.id),
        "key": row.key or "",
        "name": row.name,
        "description": row.description,
        "status": row.status,
        "parent_id": str(row.parent_id) if row.parent_id else None,
        "unit_type_id": str(row.unit_type_id) if row.unit_type_id else None,
        "manager_id": str(row.manager_id) if row.manager_id else None,
        "manager_name": _person_name(manager) if manager else "",
        "member_count": member_count,
        "custom_data": custom_data,
    }


def _unit_state(row):
    return {
        "key": row.key or "",
        "name": row.name,
        "description": row.description,
        "status": row.status,
        "parent_id": str(row.parent_id) if row.parent_id else None,
        "unit_type_id": str(row.unit_type_id) if row.unit_type_id else None,
        "manager_id": str(row.manager_id) if row.manager_id else None,
        "custom_data": dict(row.custom_data or {}),
    }


DEFAULT_UNIT_TYPES = (
    ("division", "Division", "Divisions", 0),
    ("department", "Department", "Departments", 1),
    ("team", "Team", "Teams", 2),
)


def ensure_default_unit_types(company) -> None:
    """Create Division / Department / Team once when a company has no unit types."""
    if OrganizationUnitType.objects.filter(company=company).exists():
        return
    with transaction.atomic():
        _lock_company(company.id)
        if OrganizationUnitType.objects.filter(company=company).exists():
            return
        OrganizationUnitType.objects.bulk_create(
            [
                OrganizationUnitType(
                    company=company,
                    key=key,
                    singular_label=singular,
                    plural_label=plural,
                    position=position,
                    is_active=True,
                    allowed_parent_keys=[],
                )
                for key, singular, plural, position in DEFAULT_UNIT_TYPES
            ]
        )


def list_organization(company, include_people):
    ensure_default_unit_types(company)
    types = [_type_payload(row) for row in OrganizationUnitType.objects.filter(company=company)]
    units = [
        _unit_payload(row)
        for row in Department.objects.filter(company=company).select_related("manager").annotate(member_count=Count("people")).order_by("name")
    ]
    people = []
    if include_people:
        people = [
            {"id": str(row.id), "name": _person_name(row), "department_id": str(row.department_id) if row.department_id else None}
            for row in Person.objects.filter(company=company).order_by("last_name", "first_name", "id")
        ]
    return {"types": types, "units": units, "people": people}


def unit_detail(company, unit_id, include_people):
    row = (
        Department.objects.filter(company=company, pk=unit_id)
        .select_related("manager", "unit_type", "parent")
        .annotate(member_count=Count("people"))
        .first()
    )
    if row is None:
        raise not_found("That organization unit was not found.")
    payload = _unit_payload(row)
    payload["members"] = [
        {"id": str(person.id), "name": _person_name(person)}
        for person in row.people.all().order_by("last_name", "first_name", "id")
    ]
    if include_people:
        payload["people"] = [
            {"id": str(person.id), "name": _person_name(person), "department_id": str(person.department_id) if person.department_id else None}
            for person in Person.objects.filter(company=company).order_by("last_name", "first_name", "id")
        ]
    return payload


def _parent_keys(raw):
    if raw is None:
        return []
    if not isinstance(raw, list):
        _invalid("allowed_parent_keys", "Parent types must be a list of keys.")
    keys = []
    for item in raw:
        key = normalize_key(item, "allowed_parent_keys")
        if key not in keys:
            keys.append(key)
    return keys


def save_unit_type(request, company, payload, row=None):
    if not isinstance(payload, dict):
        _invalid("", "Send a JSON object.")
    with transaction.atomic():
        _lock_company(company.id)
        if row is not None:
            row = OrganizationUnitType.objects.select_for_update().filter(company=company, pk=row.pk).first()
            if row is None:
                raise not_found("That unit type was not found.")
        key_source = payload.get("key") if "key" in payload else (row.key if row else "")
        key = normalize_key(key_source if isinstance(key_source, str) else "")
        singular_source = payload.get("singular_label") if "singular_label" in payload else (row.singular_label if row else "")
        if not isinstance(singular_source, str) or not singular_source.strip():
            _invalid("singular_label", "Enter a singular label.")
        singular = singular_source.strip()
        plural_source = payload.get("plural_label") if "plural_label" in payload else (row.plural_label if row else singular)
        plural = singular if not isinstance(plural_source, str) or not plural_source.strip() else plural_source.strip()
        icon = payload.get("icon") if "icon" in payload else (row.icon if row else "")
        if not isinstance(icon, str) or len(icon) > 64:
            _invalid("icon", "Icon must be 64 characters or fewer.")
        description = payload.get("description") if "description" in payload else (row.description if row else "")
        if not isinstance(description, str):
            _invalid("description", "Description must be text.")
        position = payload.get("position") if "position" in payload else (row.position if row else 0)
        if isinstance(position, bool) or not isinstance(position, int) or position < 0:
            _invalid("position", "Position must be zero or greater.")
        is_active = payload.get("is_active") if "is_active" in payload else (row.is_active if row else True)
        if not isinstance(is_active, bool):
            _invalid("is_active", "Active must be true or false.")
        allowed = _parent_keys(payload.get("allowed_parent_keys") if "allowed_parent_keys" in payload else (list(row.allowed_parent_keys or []) if row else []))
        known = set(OrganizationUnitType.objects.filter(company=company).exclude(pk=getattr(row, "pk", None)).values_list("key", flat=True))
        if key in known:
            raise conflict("That unit type key is already in use.", [{"field": "key", "code": "duplicate", "message": "That unit type key is already in use."}])
        unknown = [item for item in allowed if item not in known and item != key]
        if unknown:
            _invalid("allowed_parent_keys", "Choose parent types from this company.")
        before = _type_payload(row) if row else None
        if row is None:
            row = OrganizationUnitType(company=company)
        row.key = key
        row.singular_label = singular
        row.plural_label = plural
        row.icon = icon.strip()
        row.description = description
        row.position = position
        row.is_active = is_active
        row.allowed_parent_keys = allowed
        after = _type_payload(row)
        if row.pk and before == after:
            return row
        try:
            with transaction.atomic():
                row.save()
        except IntegrityError as exc:
            raise conflict("That unit type key is already in use.", [{"field": "key", "code": "duplicate", "message": "That unit type key is already in use."}]) from exc
        _audit(request, company, "organization_unit_type.saved", "organization_unit_type", row.id, before, _type_payload(row))
    return row


def _text(payload, field, current, required=False):
    if field not in payload:
        return current
    value = payload.get(field)
    if not isinstance(value, str):
        _invalid(field, "Enter text.")
    value = value.strip()
    if required and not value:
        _invalid(field, "This field is required.")
    return value


def _parse_uuid(value, message):
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        raise not_found(message) from None


def _locked_reference(model, company, object_id, message):
    if object_id in (None, ""):
        return None
    parsed = _parse_uuid(object_id, message)
    row = model.objects.select_for_update().filter(company=company, pk=parsed).first()
    if row is None:
        raise not_found(message)
    return row


def _assert_parent(unit, parent, child_type, locked):
    if parent is None:
        return
    if unit is not None and parent.id == unit.id:
        raise conflict("A unit cannot be its own parent.")
    if unit is not None:
        cursor_id = parent.parent_id
        seen = {parent.id}
        while cursor_id:
            if cursor_id == unit.id or cursor_id in seen:
                raise conflict("That parent would create a cycle.")
            seen.add(cursor_id)
            cursor = locked.get(cursor_id)
            cursor_id = cursor.parent_id if cursor else None
    if child_type is None or parent.unit_type_id is None:
        return
    allowed = list(child_type.allowed_parent_keys or [])
    if allowed and parent.unit_type.key not in allowed:
        raise conflict("That parent type is not allowed for this unit.")


def _apply_unit(request, company, payload, existing=None):
    if not isinstance(payload, dict):
        _invalid("", "Send a JSON object.")
    creating = existing is None
    name = _text(payload, "name", "" if creating else existing.name, required=True)
    if len(name) > 150:
        _invalid("name", "Name must be 150 characters or fewer.")
    description = _text(payload, "description", "" if creating else existing.description)
    status = payload.get("status") if "status" in payload else (UnitStatus.ACTIVE if creating else existing.status)
    if status not in {UnitStatus.ACTIVE, UnitStatus.INACTIVE}:
        _invalid("status", "Status must be active or inactive.")
    with transaction.atomic():
        _lock_company(company.id)
        locked = {
            row.id: row
            for row in Department.objects.select_for_update(of=("self",)).filter(company=company).select_related("unit_type")
        }
        row = None if creating else locked.get(existing.pk)
        if not creating and row is None:
            raise not_found("That organization unit was not found.")
        if "key" in payload or creating or not (row and row.key):
            key = normalize_key(payload.get("key") if isinstance(payload.get("key"), str) and payload.get("key").strip() else name)
        else:
            key = row.key
        parent = None if creating or "parent_id" in payload else row.parent
        if "parent_id" in payload:
            parent_id = payload.get("parent_id")
            if parent_id in (None, ""):
                parent = None
            else:
                parent = locked.get(_parse_uuid(parent_id, "That parent unit was not found."))
                if parent is None:
                    raise not_found("That parent unit was not found.")
        unit_type = None if creating or "unit_type_id" in payload else row.unit_type
        if "unit_type_id" in payload:
            unit_type = _locked_reference(OrganizationUnitType, company, payload.get("unit_type_id"), "That unit type was not found.")
            if unit_type is not None and not unit_type.is_active:
                raise conflict("That unit type is inactive.")
        manager = None if creating or "manager_id" in payload else row.manager
        if "manager_id" in payload:
            manager = _locked_reference(Person, company, payload.get("manager_id"), "That person was not found.")
        if any(item.key == key and item.id != getattr(row, "id", None) for item in locked.values()):
            raise conflict("That unit key is already in use.", [{"field": "key", "code": "duplicate", "message": "That unit key is already in use."}])
        if any(item.name == name and item.id != getattr(row, "id", None) for item in locked.values()):
            raise conflict("That unit name is already in use.", [{"field": "name", "code": "duplicate", "message": "That unit name is already in use."}])
        _assert_parent(row, parent, unit_type, locked)
        before = None if creating else _unit_state(row)
        from apps.authorization.company import effective_permission_codes
        from apps.tenants.models import CompanyMembership as _CM
        from apps.tenants.models import MembershipStatus as _MS

        membership = (
            _CM.objects.filter(company=company, user=request.user, status=_MS.ACTIVE).first()
            if getattr(request, "user", None) and request.user.is_authenticated
            else None
        )
        codes = effective_permission_codes(membership) if membership else set()
        custom_data = normalize_custom_data(
            company,
            FieldEntity.ORGANIZATION_UNIT,
            payload.get("custom_data") if "custom_data" in payload else None,
            creating=creating,
            existing=None if creating else (row.custom_data or {}),
            permission_codes=codes,
        )
        if creating:
            row = Department(company=company)
        row.name = name
        row.key = key
        row.description = description
        row.parent = parent
        row.unit_type = unit_type
        row.manager = manager
        row.status = status
        row.custom_data = custom_data
        after = _unit_state(row)
        if before == after:
            return row
        try:
            with transaction.atomic():
                row.save()
        except IntegrityError as exc:
            raise conflict("That unit key is already in use.") from exc
        if creating:
            action = "organization_unit.created"
        elif before["status"] != UnitStatus.INACTIVE and row.status == UnitStatus.INACTIVE:
            action = "organization_unit.deactivated"
        else:
            action = "organization_unit.updated"
        _audit(request, company, action, "organization_unit", row.id, before, after)
    return row


def create_unit(request, company, payload):
    return _apply_unit(request, company, payload, None)


def update_unit(request, company, unit_id, payload):
    existing = Department.objects.filter(company=company, pk=unit_id).first()
    if existing is None:
        raise not_found("That organization unit was not found.")
    return _apply_unit(request, company, payload, existing)


def delete_unit(request, company, unit_id):
    """Soft-delete: deactivate the unit. Hard delete is not supported."""
    with transaction.atomic():
        _lock_company(company.id)
        row = Department.objects.select_for_update().filter(company=company, pk=unit_id).first()
        if row is None:
            raise not_found("That organization unit was not found.")
        if row.status == UnitStatus.INACTIVE:
            return row
        before = _unit_state(row)
        row.status = UnitStatus.INACTIVE
        row.save(update_fields=["status", "updated_at"])
        after = _unit_state(row)
        _audit(request, company, "organization_unit.deactivated", "organization_unit", row.id, before, after)
        return row


def assign_members(request, company, unit_id, person_ids):
    if not isinstance(person_ids, list):
        _invalid("person_ids", "Send a list of people.")
    with transaction.atomic():
        _lock_company(company.id)
        unit = Department.objects.select_for_update().filter(company=company, pk=unit_id).first()
        if unit is None:
            raise not_found("That organization unit was not found.")
        wanted = []
        for person_id in person_ids:
            parsed = _parse_uuid(person_id, "That person was not found.")
            if parsed in wanted:
                continue
            person = Person.objects.select_for_update().filter(company=company, pk=parsed).first()
            if person is None:
                raise not_found("That person was not found.")
            wanted.append(person.id)
        current = list(Person.objects.filter(company=company, department=unit).order_by("id").values_list("id", flat=True))
        if set(current) == set(wanted):
            return unit
        before = [str(item) for item in current]
        Person.objects.filter(company=company, department=unit).exclude(id__in=wanted).update(department=None)
        if wanted:
            Person.objects.filter(company=company, id__in=wanted).update(department=unit)
        after = [str(item) for item in Person.objects.filter(company=company, department=unit).order_by("id").values_list("id", flat=True)]
        _audit(request, company, "organization_unit.members_changed", "organization_unit", unit.id, {"person_ids": before}, {"person_ids": after})
    return unit


def _membership_bits(membership):
    if membership is None:
        return {
            "membership_id": None,
            "membership_status": None,
            "roles": [],
            "permissions": [],
            "last_login": None,
            "email": "",
        }
    from apps.authorization.company import effective_permission_codes

    return {
        "membership_id": str(membership.id),
        "membership_status": membership.status,
        "roles": [
            {"id": str(item.role_id), "name": item.role.name, "is_owner_role": item.role.is_owner_role}
            for item in membership.role_assignments.all()
        ],
        "permissions": sorted(effective_permission_codes(membership)),
        "last_login": membership.user.last_login.isoformat() if membership.user.last_login else None,
        "email": membership.user.email,
    }


def _directory_row(person, membership, company_name, *, permission_codes=None, viewer_person_id=None):
    bits = _membership_bits(membership)
    email = bits.pop("email") or person.work_email
    custom_data = dict(person.custom_data or {})
    if permission_codes is not None:
        from apps.tenants.custom_data_access import load_active_definitions

        custom_data = serialize_custom_data(
            load_active_definitions(person.company, FieldEntity.PERSON),
            custom_data,
            entity=FieldEntity.PERSON,
            permission_codes=permission_codes,
            is_self=viewer_person_id is not None and str(person.id) == str(viewer_person_id),
        )
    return {
        "id": str(person.id),
        "person_id": str(person.id),
        "first_name": person.first_name,
        "last_name": person.last_name,
        "email": email,
        "job_title": person.job_title,
        "status": person.status,
        "organization": person.department.name if person.department_id else company_name,
        "department_id": str(person.department_id) if person.department_id else None,
        "custom_data": custom_data,
        **bits,
    }


def list_people(company, *, status: str | None = PersonStatus.ACTIVE, permission_codes=None, viewer_person_id=None):
    memberships = list(
        CompanyMembership.objects.filter(company=company)
        .exclude(status=MembershipStatus.REMOVED)
        .select_related("user", "person")
        .prefetch_related("role_assignments__role")
    )
    by_person = {}
    by_email = {}
    for membership in memberships:
        if membership.person_id:
            by_person.setdefault(membership.person_id, membership)
        by_email.setdefault(membership.user.email.lower(), membership)
    used = set()
    results = []
    people = Person.objects.filter(company=company).select_related("department").order_by("last_name", "first_name", "id")
    if status and status != "all":
        people = people.filter(status=status)
    for person in people:
        membership = by_person.get(person.id)
        if membership is None and person.work_email:
            membership = by_email.get(person.work_email.strip().lower())
        if membership is not None:
            used.add(membership.id)
        results.append(
            _directory_row(
                person,
                membership,
                company.display_name,
                permission_codes=permission_codes,
                viewer_person_id=viewer_person_id,
            )
        )
    for membership in memberships:
        if membership.id in used:
            continue
        bits = _membership_bits(membership)
        email = bits.pop("email")
        custom_data = dict(membership.custom_data or {}) if hasattr(membership, "custom_data") else {}
        if permission_codes is not None and membership.person_id is None:
            custom_data = {}
        results.append(
            {
                "id": str(membership.id),
                "person_id": str(membership.person_id) if membership.person_id else None,
                "first_name": membership.user.first_name,
                "last_name": membership.user.last_name,
                "email": email,
                "job_title": "",
                "status": "active",
                "organization": company.display_name,
                "department_id": None,
                "custom_data": custom_data,
                **bits,
            }
        )
    return results


def person_directory_row(company, person, *, permission_codes=None, viewer_person_id=None):
    match = next(
        (
            row
            for row in list_people(
                company,
                status="all",
                permission_codes=permission_codes,
                viewer_person_id=viewer_person_id,
            )
            if row["person_id"] == str(person.id)
        ),
        None,
    )
    if match is None:
        raise not_found("That person was not found.")
    return match


def create_person(request, company, payload):
    if not isinstance(payload, dict):
        _invalid("", "Send a JSON object.")
    first = payload.get("first_name")
    last = payload.get("last_name")
    if not isinstance(first, str) or not first.strip():
        name = payload.get("name")
        if not isinstance(name, str) or not name.strip():
            _invalid("name", "Enter a name.")
        parts = name.strip().split()
        first = parts[0]
        last = " ".join(parts[1:])
    first = first.strip()[:150]
    last = last.strip()[:150] if isinstance(last, str) else ""
    if not first:
        _invalid("name", "Enter a name.")

    raw_email = payload.get("work_email", "")
    if not isinstance(raw_email, str) or not raw_email.strip():
        _invalid("work_email", "Enter an email address.")
    email = raw_email.strip().lower()
    if "@" not in email or "." not in email.split("@", 1)[-1] or " " in email:
        _invalid("work_email", "Enter a valid email address.")
    if Person.objects.filter(company=company, work_email__iexact=email).exists():
        raise conflict(
            "A person with that email already exists.",
            [{"field": "work_email", "code": "unique", "message": "A person with that email already exists."}],
        )

    title = payload.get("job_title", "")
    if not isinstance(title, str) or not title.strip():
        _invalid("job_title", "Enter a designation.")
    job_title = title.strip()[:150]
    from apps.authorization.company import effective_permission_codes

    actor_membership = (
        CompanyMembership.objects.filter(company=company, user=request.user, status=MembershipStatus.ACTIVE).first()
        if getattr(request, "user", None) and request.user.is_authenticated
        else None
    )
    codes = effective_permission_codes(actor_membership) if actor_membership else set()
    custom_data = normalize_custom_data(
        company,
        FieldEntity.PERSON,
        payload.get("custom_data") if "custom_data" in payload else None,
        creating=True,
        existing={},
        permission_codes=codes,
        is_self=False,
    )

    try:
        person = Person.objects.create(
            company=company,
            first_name=first,
            last_name=last,
            work_email=email,
            job_title=job_title,
            status=PersonStatus.ACTIVE,
            custom_data=custom_data,
        )
    except IntegrityError as exc:
        if "people_company_work_email_unique" in str(exc):
            raise conflict(
                "A person with that email already exists.",
                [{"field": "work_email", "code": "unique", "message": "A person with that email already exists."}],
            ) from exc
        raise
    _audit(
        request,
        company,
        "person.created",
        "person",
        person.id,
        None,
        {"name": _person_name(person), "work_email": email, "job_title": person.job_title, "custom_data": custom_data},
    )
    return person


def update_person(request, company, person_id, payload):
    if not isinstance(payload, dict):
        _invalid("", "Send a JSON object.")
    person = Person.objects.filter(company=company, pk=person_id).first()
    if person is None:
        raise not_found("That person was not found.")

    from apps.authorization.company import effective_permission_codes

    actor_membership = (
        CompanyMembership.objects.filter(company=company, user=request.user, status=MembershipStatus.ACTIVE)
        .select_related("person")
        .first()
        if getattr(request, "user", None) and request.user.is_authenticated
        else None
    )
    codes = effective_permission_codes(actor_membership) if actor_membership else set()
    is_self = bool(actor_membership and actor_membership.person_id and actor_membership.person_id == person.id)
    has_people_update = "people.update" in codes

    before = {
        "first_name": person.first_name,
        "last_name": person.last_name,
        "work_email": person.work_email,
        "job_title": person.job_title,
        "department_id": str(person.department_id) if person.department_id else None,
        "custom_data": dict(person.custom_data or {}),
    }

    if has_people_update:
        if "first_name" in payload:
            first = payload.get("first_name")
            if not isinstance(first, str) or not first.strip():
                _invalid("first_name", "Enter a first name.")
            person.first_name = first.strip()[:150]
        if "last_name" in payload:
            last = payload.get("last_name")
            if last is None:
                last = ""
            if not isinstance(last, str):
                _invalid("last_name", "Enter a last name.")
            person.last_name = last.strip()[:150]
        if "job_title" in payload:
            title = payload.get("job_title")
            if not isinstance(title, str) or not title.strip():
                _invalid("job_title", "Enter a designation.")
            person.job_title = title.strip()[:150]
        if "department_id" in payload:
            dept_id = payload.get("department_id")
            if dept_id in (None, ""):
                person.department = None
            else:
                department = Department.objects.filter(company=company, pk=dept_id).first()
                if department is None:
                    raise not_found("That organization unit was not found.")
                person.department = department
        if "work_email" in payload:
            raw_email = payload.get("work_email")
            if not isinstance(raw_email, str) or not raw_email.strip():
                _invalid("work_email", "Enter an email address.")
            email = raw_email.strip().lower()
            if "@" not in email or "." not in email.split("@", 1)[-1] or " " in email:
                _invalid("work_email", "Enter a valid email address.")
            clash = Person.objects.filter(company=company, work_email__iexact=email).exclude(pk=person.pk).exists()
            if clash:
                raise conflict(
                    "A person with that email already exists.",
                    [{"field": "work_email", "code": "unique", "message": "A person with that email already exists."}],
                )
            person.work_email = email

    if "custom_data" in payload:
        if not has_people_update and not is_self:
            raise permission_denied("You do not have permission to update this person.")
        person.custom_data = normalize_custom_data(
            company,
            FieldEntity.PERSON,
            payload.get("custom_data"),
            creating=False,
            existing=person.custom_data or {},
            permission_codes=codes,
            is_self=is_self and not has_people_update,
        )
    elif not has_people_update:
        raise permission_denied("You do not have permission to update this person.")

    person.save()
    after = {
        "first_name": person.first_name,
        "last_name": person.last_name,
        "work_email": person.work_email,
        "job_title": person.job_title,
        "department_id": str(person.department_id) if person.department_id else None,
        "custom_data": dict(person.custom_data or {}),
    }
    if before != after:
        _audit(request, company, "person.updated", "person", person.id, before, after)
    return person


def set_person_status(request, company, person_id, status: str):
    if status not in {PersonStatus.ACTIVE, PersonStatus.INACTIVE}:
        _invalid("status", "Choose active or inactive.")
    person = Person.objects.filter(company=company, pk=person_id).first()
    if person is None:
        raise not_found("That person was not found.")
    if person.status == status:
        return person
    before = {"status": person.status, "deactivated_at": person.deactivated_at.isoformat() if person.deactivated_at else None}
    person.status = status
    if status == PersonStatus.INACTIVE:
        person.deactivated_at = timezone.now()
    else:
        person.deactivated_at = None
    person.save(update_fields=["status", "deactivated_at", "updated_at"])
    after = {"status": person.status, "deactivated_at": person.deactivated_at.isoformat() if person.deactivated_at else None}
    action = "person.deactivated" if status == PersonStatus.INACTIVE else "person.activated"
    _audit(request, company, action, "person", person.id, before, after)
    return person
