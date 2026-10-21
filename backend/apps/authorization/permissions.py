from rest_framework.permissions import BasePermission

from apps.authorization.services import user_has_platform_permission
from common.api.errors import permission_denied


class HasPlatformPermission(BasePermission):
    """Deny by default unless the session user holds the view's platform permission code."""

    def has_permission(self, request, view) -> bool:
        code = getattr(view, "required_platform_permission", None)
        if not code or not user_has_platform_permission(request.user, code):
            raise permission_denied()
        return True
