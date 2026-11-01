"""Shared field-type normalization for system custom fields and custom entity fields."""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Protocol

from apps.authorization.models import CompanyRole
from apps.organization.models import Department, Person
from common.api.errors import validation_error

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_URL = re.compile(r"^https?://", re.IGNORECASE)
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

TEXT_MAX = 500
LONG_TEXT_MAX = 5000
EMAIL_MAX = 254
MAX_CUSTOM_KEYS = 50
MAX_CUSTOM_PAYLOAD_BYTES = 64 * 1024

TEXT_PATTERNS = {"none", "digits", "indian_mobile"}
_INDIAN_MOBILE = re.compile(r"^[6-9]\d{9}$")
_DIGITS_ONLY = re.compile(r"^\d+$")

REFERENCE_TARGETS = {
    "role": {
        "label": "Roles",
        "permission": "roles.view",
        "noun_singular": "role",
        "noun_plural": "roles",
    },
    "person": {
        "label": "People",
        "permission": "people.view",
        "noun_singular": "person",
        "noun_plural": "people",
    },
    "organization_unit": {
        "label": "Organization units",
        "permission": "departments.view",
        "noun_singular": "organization unit",
        "noun_plural": "organization units",
    },
    "custom_entity": {
        "label": "Custom entity records",
        "permission": "custom_entities.view",
        "noun_singular": "record",
        "noun_plural": "records",
    },
}


class FieldLike(Protocol):
    key: str
    name: str
    field_type: str
    required: bool
    options: Any
    config: Any
    company_id: Any


def invalid(field: str, message: str):
    raise validation_error([{"field": field, "code": "invalid", "message": message}], message=message)


def is_empty(value) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and not value.strip():
        return True
    if isinstance(value, (list, dict)) and len(value) == 0:
        return True
    return False


def parse_uuid(raw, field_path: str) -> uuid.UUID:
    if isinstance(raw, uuid.UUID):
        return raw
    if not isinstance(raw, str) or not raw.strip():
        invalid(field_path, "Choose a valid linked record.")
    try:
        return uuid.UUID(raw.strip())
    except ValueError:
        invalid(field_path, "Choose a valid linked record.")


def ensure_flat_payload(incoming: dict, field_name: str = "custom_data") -> None:
    if len(incoming) > MAX_CUSTOM_KEYS:
        invalid(field_name, f"At most {MAX_CUSTOM_KEYS} custom field values are allowed.")
    # Rough size guard on JSON-ish content.
    size = 0
    for key, value in incoming.items():
        size += len(str(key)) + len(str(value))
        if isinstance(value, (dict,)):
            invalid(f"{field_name}.{key}", "Nested objects are not allowed.")
        if isinstance(value, list) and any(isinstance(item, (dict, list)) for item in value):
            invalid(f"{field_name}.{key}", "Nested lists are not allowed.")
    if size > MAX_CUSTOM_PAYLOAD_BYTES:
        invalid(field_name, "Custom field payload is too large.")


def existing_reference_ids(company_id, target: str, ids: list[uuid.UUID], *, entity_id=None) -> set[uuid.UUID]:
    if target == "role":
        return set(CompanyRole.objects.filter(company_id=company_id, id__in=ids).values_list("id", flat=True))
    if target == "person":
        return set(Person.objects.filter(company_id=company_id, id__in=ids).values_list("id", flat=True))
    if target == "organization_unit":
        return set(Department.objects.filter(company_id=company_id, id__in=ids).values_list("id", flat=True))
    if target == "custom_entity":
        from apps.tenants.models import CustomEntityRecord

        qs = CustomEntityRecord.objects.filter(company_id=company_id, id__in=ids, archived_at__isnull=True)
        if entity_id is not None:
            qs = qs.filter(entity_id=entity_id)
        return set(qs.values_list("id", flat=True))
    return set()


def normalize_reference(definition: FieldLike, value, field_path: str):
    config = dict(definition.config or {})
    target = config.get("target")
    multiple = bool(config.get("multiple", True))
    meta = REFERENCE_TARGETS.get(target)
    if meta is None:
        invalid(field_path, "Unsupported link target.")
    entity_id = None
    if target == "custom_entity":
        entity_id = config.get("entity_id")
        if not entity_id:
            invalid(field_path, "Link target entity is not configured.")
        try:
            entity_id = uuid.UUID(str(entity_id))
        except ValueError:
            invalid(field_path, "Link target entity is not configured.")
    noun = meta["noun_singular"]
    nouns = meta["noun_plural"]
    if multiple:
        if isinstance(value, str):
            value = [value] if value.strip() else []
        if not isinstance(value, list):
            invalid(field_path, f"Choose one or more {nouns}.")
        parsed = []
        for item in value:
            if is_empty(item):
                continue
            parsed_id = parse_uuid(item, field_path)
            if parsed_id not in parsed:
                parsed.append(parsed_id)
        if not parsed:
            return None
        found = existing_reference_ids(definition.company_id, target, parsed, entity_id=entity_id)
        if len(found) != len(parsed):
            invalid(field_path, f"Choose {nouns} that belong to this company.")
        return [str(item) for item in parsed]
    parsed_id = parse_uuid(value, field_path)
    if not existing_reference_ids(definition.company_id, target, [parsed_id], entity_id=entity_id):
        invalid(field_path, f"Choose a {noun} that belongs to this company.")
    return str(parsed_id)


def _validation_from_definition(definition: FieldLike) -> dict:
    config = definition.config if isinstance(getattr(definition, "config", None), dict) else {}
    raw = config.get("validation") if isinstance(config, dict) else None
    if not isinstance(raw, dict) or not raw:
        return {}
    return raw


def validation_config(field_type: str, raw) -> dict:
    """Clean optional per-field validation rules. Empty / None → {}."""
    from apps.tenants.models import FieldType

    if raw is None:
        return {}
    if not isinstance(raw, dict):
        invalid("config.validation", "Send validation rules as an object.")
    if not raw:
        return {}

    cleaned: dict[str, Any] = {}
    if field_type in {FieldType.TEXT, FieldType.LONG_TEXT, FieldType.PHONE}:
        hard_cap = LONG_TEXT_MAX if field_type == FieldType.LONG_TEXT else TEXT_MAX
        for key in ("min_length", "max_length"):
            if key not in raw:
                continue
            value = raw.get(key)
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                invalid(f"config.validation.{key}", "Enter a non-negative whole number.")
            cleaned[key] = value
        if "min_length" in cleaned and "max_length" in cleaned and cleaned["min_length"] > cleaned["max_length"]:
            invalid("config.validation.min_length", "Minimum length cannot be greater than maximum length.")
        if "max_length" in cleaned and cleaned["max_length"] > hard_cap:
            invalid("config.validation.max_length", f"Maximum length cannot exceed {hard_cap}.")
        if "pattern" in raw:
            pattern = raw.get("pattern")
            if pattern is None or pattern == "" or pattern == "none":
                pass
            elif pattern not in TEXT_PATTERNS:
                invalid("config.validation.pattern", "Choose none, digits, or indian_mobile.")
            else:
                cleaned["pattern"] = pattern
                if pattern == "indian_mobile":
                    cleaned["min_length"] = 10
                    cleaned["max_length"] = 10
        unknown = set(raw) - {"min_length", "max_length", "pattern"}
        if unknown:
            invalid("config.validation", f"Unsupported validation rule: {sorted(unknown)[0]}.")
        return cleaned

    if field_type == FieldType.EMAIL:
        if "max_length" in raw:
            value = raw.get("max_length")
            if not isinstance(value, int) or isinstance(value, bool) or value < 1:
                invalid("config.validation.max_length", "Enter a positive whole number.")
            if value > EMAIL_MAX:
                invalid("config.validation.max_length", f"Maximum length cannot exceed {EMAIL_MAX}.")
            cleaned["max_length"] = value
        unknown = set(raw) - {"max_length"}
        if unknown:
            invalid("config.validation", f"Unsupported validation rule: {sorted(unknown)[0]}.")
        return cleaned

    if field_type == FieldType.NUMBER:
        for key in ("min", "max"):
            if key not in raw:
                continue
            value = raw.get(key)
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                invalid(f"config.validation.{key}", "Enter a number.")
            cleaned[key] = float(value)
        if "min" in cleaned and "max" in cleaned and cleaned["min"] > cleaned["max"]:
            invalid("config.validation.min", "Minimum cannot be greater than maximum.")
        if "integer_only" in raw:
            flag = raw.get("integer_only")
            if not isinstance(flag, bool):
                invalid("config.validation.integer_only", "Choose on or off.")
            cleaned["integer_only"] = flag
        unknown = set(raw) - {"min", "max", "integer_only"}
        if unknown:
            invalid("config.validation", f"Unsupported validation rule: {sorted(unknown)[0]}.")
        return cleaned

    if field_type == FieldType.DATE:
        for key in ("min_date", "max_date"):
            if key not in raw:
                continue
            value = raw.get(key)
            if not isinstance(value, str) or not value.strip():
                invalid(f"config.validation.{key}", "Enter a date as YYYY-MM-DD.")
            try:
                cleaned[key] = date.fromisoformat(value.strip()[:10]).isoformat()
            except ValueError:
                invalid(f"config.validation.{key}", "Enter a date as YYYY-MM-DD.")
        if "min_date" in cleaned and "max_date" in cleaned and cleaned["min_date"] > cleaned["max_date"]:
            invalid("config.validation.min_date", "Earliest date cannot be after latest date.")
        unknown = set(raw) - {"min_date", "max_date"}
        if unknown:
            invalid("config.validation", f"Unsupported validation rule: {sorted(unknown)[0]}.")
        return cleaned

    if raw:
        invalid("config.validation", "Validation rules are not supported for this field type.")
    return {}


def merge_field_config(field_type: str, *, base: dict | None = None, validation_raw=None, has_validation: bool = False) -> dict:
    """Merge validation into field config. Omits empty validation."""
    config = dict(base or {})
    if has_validation:
        rules = validation_config(field_type, validation_raw)
        if rules:
            config["validation"] = rules
        else:
            config.pop("validation", None)
    return config


def extract_validation_raw(payload: dict):
    """Read validation from payload.validation or payload.config.validation."""
    if not isinstance(payload, dict):
        return None, False
    if "validation" in payload:
        return payload.get("validation"), True
    config = payload.get("config")
    if isinstance(config, dict) and "validation" in config:
        return config.get("validation"), True
    return None, False


def apply_validation(field_type: str, value, rules: dict, field_path: str):
    """Apply cleaned validation rules to an already type-normalized value."""
    from apps.tenants.models import FieldType

    if not rules:
        return value

    if field_type in {FieldType.TEXT, FieldType.LONG_TEXT, FieldType.PHONE}:
        text = value if isinstance(value, str) else str(value)
        pattern = rules.get("pattern")
        if pattern == "indian_mobile":
            digits = re.sub(r"[\s\-]", "", text)
            if not _INDIAN_MOBILE.match(digits):
                invalid(field_path, "Enter a 10-digit Indian mobile number.")
            text = digits
        elif pattern == "digits":
            digits = re.sub(r"[\s\-]", "", text)
            if not _DIGITS_ONLY.match(digits):
                invalid(field_path, "Enter digits only.")
            text = digits
        min_length = rules.get("min_length")
        max_length = rules.get("max_length")
        if isinstance(min_length, int) and len(text) < min_length:
            invalid(field_path, f"Enter at least {min_length} characters.")
        if isinstance(max_length, int) and len(text) > max_length:
            invalid(field_path, f"Enter at most {max_length} characters.")
        return text

    if field_type == FieldType.EMAIL:
        text = value if isinstance(value, str) else str(value)
        max_length = rules.get("max_length")
        if isinstance(max_length, int) and len(text) > max_length:
            invalid(field_path, f"Enter at most {max_length} characters.")
        return text

    if field_type == FieldType.NUMBER:
        number = Decimal(str(value))
        if rules.get("integer_only") and number != number.to_integral_value():
            invalid(field_path, "Enter a whole number.")
        if "min" in rules and float(number) < rules["min"]:
            invalid(field_path, f"Enter a number of at least {rules['min']}.")
        if "max" in rules and float(number) > rules["max"]:
            invalid(field_path, f"Enter a number of at most {rules['max']}.")
        return float(number)

    if field_type == FieldType.DATE:
        text = value if isinstance(value, str) else str(value)
        if "min_date" in rules and text < rules["min_date"]:
            invalid(field_path, f"Enter a date on or after {rules['min_date']}.")
        if "max_date" in rules and text > rules["max_date"]:
            invalid(field_path, f"Enter a date on or before {rules['max_date']}.")
        return text

    return value


def normalize_value(definition: FieldLike, value, field_path: str):
    from apps.tenants.models import FieldType

    if is_empty(value):
        return None
    field_type = definition.field_type
    rules = _validation_from_definition(definition)
    if field_type in {FieldType.TEXT, FieldType.LONG_TEXT, FieldType.PHONE}:
        if not isinstance(value, str):
            invalid(field_path, "Enter text.")
        limit = LONG_TEXT_MAX if field_type == FieldType.LONG_TEXT else TEXT_MAX
        text = value.strip()
        if len(text) > limit:
            invalid(field_path, f"Value must be {limit} characters or fewer.")
        return apply_validation(field_type, text, rules, field_path)
    if field_type == FieldType.EMAIL:
        if not isinstance(value, str) or not _EMAIL.match(value.strip()):
            invalid(field_path, "Enter a valid email address.")
        text = value.strip()[:EMAIL_MAX]
        return apply_validation(field_type, text, rules, field_path)
    if field_type == FieldType.URL:
        if not isinstance(value, str) or not _URL.match(value.strip()):
            invalid(field_path, "Enter a URL starting with http:// or https://.")
        return value.strip()[:500]
    if field_type == FieldType.NUMBER:
        if isinstance(value, bool):
            invalid(field_path, "Enter a number.")
        try:
            if isinstance(value, (int, float, Decimal)):
                number = Decimal(str(value))
            elif isinstance(value, str) and value.strip():
                number = Decimal(value.strip())
            else:
                raise InvalidOperation
        except (InvalidOperation, ValueError):
            invalid(field_path, "Enter a number.")
        return apply_validation(field_type, float(number), rules, field_path)
    if field_type == FieldType.BOOLEAN:
        if isinstance(value, bool):
            return value
        if value in ("true", "True", "1", 1):
            return True
        if value in ("false", "False", "0", 0):
            return False
        invalid(field_path, "Choose yes or no.")
    if field_type == FieldType.DATE:
        if isinstance(value, date) and not isinstance(value, datetime):
            iso = value.isoformat()
        elif isinstance(value, datetime):
            iso = value.date().isoformat()
        elif isinstance(value, str) and value.strip():
            try:
                iso = date.fromisoformat(value.strip()[:10]).isoformat()
            except ValueError:
                invalid(field_path, "Enter a date as YYYY-MM-DD.")
        else:
            invalid(field_path, "Enter a date as YYYY-MM-DD.")
        return apply_validation(field_type, iso, rules, field_path)
    if field_type == FieldType.SELECT:
        if not isinstance(value, str):
            invalid(field_path, "Choose an option.")
        text = value.strip()
        if text not in (definition.options or []):
            invalid(field_path, "Choose one of the configured options.")
        return text
    if field_type == FieldType.MULTI_SELECT:
        if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
            invalid(field_path, "Choose one or more options.")
        allowed = set(definition.options or [])
        cleaned = []
        for item in value:
            text = item.strip()
            if not text:
                continue
            if text not in allowed:
                invalid(field_path, "Choose from the configured options.")
            if text not in cleaned:
                cleaned.append(text)
        return cleaned
    if field_type == FieldType.REFERENCE:
        return normalize_reference(definition, value, field_path)
    invalid(field_path, "Unsupported field type.")


def options_list(field_type, options):
    from apps.tenants.models import FieldType

    if field_type in {FieldType.SELECT, FieldType.MULTI_SELECT}:
        if not isinstance(options, list) or not options or not all(isinstance(item, str) and item.strip() for item in options):
            invalid("options", "Enter at least one option.")
        cleaned = [item.strip()[:150] for item in options]
        if len(set(cleaned)) != len(cleaned):
            invalid("options", "Options must be unique.")
        return cleaned
    return []


def reference_config(payload, *, existing=None, allow_custom_entity: bool = True):
    from apps.tenants.models import CustomEntity, FieldStatus

    if "config" not in payload:
        if existing is not None:
            return dict(existing or {})
        invalid("config", "Choose link settings for this field.")
    raw = payload.get("config")
    if not isinstance(raw, dict):
        invalid("config", "Send link settings as an object.")
    target = raw.get("target")
    allowed = set(REFERENCE_TARGETS)
    if not allow_custom_entity:
        allowed.discard("custom_entity")
    if target not in allowed:
        invalid("config.target", "Choose a link target.")
    multiple = raw.get("multiple", True)
    if not isinstance(multiple, bool):
        invalid("config.multiple", "Choose on or off.")
    config = {"target": target, "multiple": multiple}
    if target == "custom_entity":
        entity_id = raw.get("entity_id")
        if not entity_id:
            invalid("config.entity_id", "Choose a custom entity to link.")
        try:
            parsed = uuid.UUID(str(entity_id))
        except ValueError:
            invalid("config.entity_id", "Choose a custom entity to link.")
        company_id = payload.get("_company_id") or (existing or {}).get("_company_id")
        # company validated by caller via entity lookup when company provided on definition create
        row = CustomEntity.objects.filter(pk=parsed, status=FieldStatus.ACTIVE).first()
        if row is None:
            invalid("config.entity_id", "Choose a custom entity to link.")
        if company_id and str(row.company_id) != str(company_id):
            invalid("config.entity_id", "Choose a custom entity in this company.")
        config["entity_id"] = str(row.id)
        config["entity_key"] = row.key
    return config
