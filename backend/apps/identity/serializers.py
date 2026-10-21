from django.contrib.auth import get_user_model

from apps.tenants.models import MembershipStatus


def serialize_current_user(user) -> dict:
    memberships = (
        user.memberships.select_related("company")
        .order_by("created_at", "id")
    )
    permission_codes = list(
        user.platform_grants.order_by("permission_id").values_list("permission_id", flat=True)
    )
    return {
        "id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email_verified": user.email_verified_at is not None,
        "memberships": [
            {
                "company_id": str(membership.company_id),
                "company_slug": membership.company.slug,
                "company_display_name": membership.company.display_name,
                "status": membership.status,
            }
            for membership in memberships
            if membership.status == MembershipStatus.ACTIVE
        ],
        "platform_permissions": permission_codes,
    }


def normalize_email(value: str) -> str:
    return value.strip().lower()


def get_user_model_name() -> str:
    return get_user_model()._meta.label
