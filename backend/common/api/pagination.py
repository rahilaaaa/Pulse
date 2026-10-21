import math

from django.db.models import QuerySet

from common.api.errors import validation_error

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 25


def paginate(queryset: QuerySet, *, page_raw: str | None, page_size_raw: str | None) -> dict:
    page = _positive_int(page_raw, default=1, field="page")
    page_size = _positive_int(page_size_raw, default=DEFAULT_PAGE_SIZE, field="page_size", maximum=MAX_PAGE_SIZE)
    count = queryset.count()
    offset = (page - 1) * page_size
    if offset >= count:
        results = []
    else:
        results = list(queryset[offset : offset + page_size])
    return {
        "results": results,
        "page": page,
        "page_size": page_size,
        "count": count,
        "page_count": math.ceil(count / page_size) if count else 0,
    }


def page_errors(page_raw: str | None, page_size_raw: str | None) -> list[dict]:
    errors = []
    errors.extend(_int_errors(page_raw, field="page", maximum=None))
    errors.extend(_int_errors(page_size_raw, field="page_size", maximum=MAX_PAGE_SIZE))
    return errors


def _int_errors(raw: str | None, *, field: str, maximum: int | None) -> list[dict]:
    if raw is None or raw == "":
        return []
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return [{"field": field, "code": "invalid", "message": "Enter a whole number."}]
    if value < 1:
        return [{"field": field, "code": "invalid", "message": "Enter a number of at least 1."}]
    if maximum is not None and value > maximum:
        return [{"field": field, "code": "max_value", "message": f"Enter a number no greater than {maximum}."}]
    return []


def _positive_int(raw: str | None, *, default: int, field: str, maximum: int | None = None) -> int:
    errors = _int_errors(raw, field=field, maximum=maximum)
    if errors:
        raise validation_error(errors)
    if raw is None or raw == "":
        return default
    return int(raw)
