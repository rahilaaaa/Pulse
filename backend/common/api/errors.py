from common.api.exceptions import PulseAPIException


def validation_error(details: list[dict], message: str = "The request is invalid.") -> PulseAPIException:
    return PulseAPIException(
        code="validation_error",
        message=message,
        status_code=400,
        details=details,
    )


def not_authenticated(message: str = "Authentication credentials were not provided.") -> PulseAPIException:
    return PulseAPIException(code="not_authenticated", message=message, status_code=401)


def permission_denied(message: str = "You do not have permission to perform this action.") -> PulseAPIException:
    return PulseAPIException(code="permission_denied", message=message, status_code=403)


def not_found(message: str = "Not found.") -> PulseAPIException:
    return PulseAPIException(code="not_found", message=message, status_code=404)


def conflict(message: str, details: list[dict] | None = None) -> PulseAPIException:
    return PulseAPIException(code="conflict", message=message, status_code=409, details=details or [])


def rate_limited() -> PulseAPIException:
    return PulseAPIException(
        code="rate_limited",
        message="Too many requests. Try again later.",
        status_code=429,
    )
