from django.contrib.auth import get_user_model
from apps.tenants.models import MembershipStatus


def serialize_current_user(user) -> dict:
    from apps.authorization.services import get_operator_profile, is_super_admin, platform_permission_codes

    memberships = (
        user.memberships.select_related("company")
        .order_by("created_at", "id")
    )
    permission_codes = platform_permission_codes(user)
    super_admin = is_super_admin(user)
    profile = get_operator_profile(user)
    role_info = None
    if profile and profile.role:
        role_info = {
            "id": str(profile.role.id),
            "name": profile.role.name,
            "slug": profile.role.slug,
        }

    return {
        "id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email_verified": user.email_verified_at is not None,
        "is_super_admin": super_admin,
        "is_platform_operator": super_admin or (profile is not None),
        "operator_status": profile.status if profile else None,
        "platform_role": role_info,
        "memberships": [
            {
                "company_id": str(membership.company_id),
                "company_slug": membership.company.slug,
                "company_display_name": membership.company.display_name,
                "company_status": membership.company.status,
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
