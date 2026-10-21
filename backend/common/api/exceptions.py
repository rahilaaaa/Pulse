from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler


class PulseAPIException(APIException):
    def __init__(self, *, code: str, message: str, status_code: int, details=None):
        self.pulse_code = code
        self.pulse_details = details or []
        self.status_code = status_code
        super().__init__(detail=message)


def _request_id(context) -> str | None:
    request = context.get("request")
    if request is None:
        return None
    return getattr(request, "request_id", None)


def _field_details(data) -> list[dict]:
    details = []
    if isinstance(data, dict):
        for field, messages in data.items():
            if isinstance(messages, (list, tuple)):
                for message in messages:
                    details.append({"field": field, "code": "invalid", "message": str(message)})
            elif isinstance(messages, dict):
                details.extend(_field_details(messages))
            else:
                details.append({"field": field, "code": "invalid", "message": str(messages)})
    elif isinstance(data, list):
        for message in data:
            details.append({"field": "", "code": "invalid", "message": str(message)})
    return details


def api_exception_handler(exc, context):
    if isinstance(exc, PulseAPIException):
        return _body(
            status_code=exc.status_code,
            code=exc.pulse_code,
            message=str(exc.detail),
            details=exc.pulse_details,
            request_id=_request_id(context),
        )

    response = exception_handler(exc, context)
    if response is None:
        return None

    status_code = response.status_code
    code = "server_error"
    message = "The request could not be completed."
    details = []

    if status_code == 401:
        code = "not_authenticated"
        message = "Authentication credentials were not provided."
    elif status_code == 403:
        code = "permission_denied"
        message = "You do not have permission to perform this action."
    elif status_code == 404:
        code = "not_found"
        message = "Not found."
    elif status_code == 429:
        code = "rate_limited"
        message = "Too many requests. Try again later."
    elif status_code == 400:
        code = "validation_error"
        message = "The request is invalid."
        details = _field_details(response.data)

    return _body(
        status_code=status_code,
        code=code,
        message=message,
        details=details,
        request_id=_request_id(context),
    )


def _body(*, status_code: int, code: str, message: str, details: list, request_id):
    from rest_framework.response import Response

    response = Response(
        {
            "error": {
                "code": code,
                "message": message,
                "details": details,
                "request_id": request_id,
            }
        },
        status=status_code,
    )
    if request_id:
        response["X-Request-Id"] = request_id
    return response
