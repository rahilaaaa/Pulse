from django.http import JsonResponse


def csrf_failure(request, reason=""):
    request_id = getattr(request, "request_id", None)
    return JsonResponse(
        {
            "error": {
                "code": "permission_denied",
                "message": "CSRF verification failed.",
                "details": [],
                "request_id": request_id,
            }
        },
        status=403,
    )
