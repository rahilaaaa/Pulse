import time
from datetime import timedelta
from django.db import connection, transaction
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.identity.models import User
from apps.platform_admin.models import PlatformSetting
from apps.tenants.models import Company, CompanyStatus, InvitationStatus, MembershipInvitation, OnboardingState
from common.api.errors import validation_error

DEFAULT_SETTINGS = {
    "grace_period_days": 7,
    "company_registration_enabled": True,
    "default_plan_code": "growth",
    "maintenance_mode": False,
    "platform_banner_message": "",
}


def get_platform_settings() -> dict:
    settings_dict = dict(DEFAULT_SETTINGS)
    for row in PlatformSetting.objects.all():
        settings_dict[row.key] = row.value.get("value", row.value)
    return settings_dict


def update_platform_settings(*, actor: User, payload: dict, request) -> dict:
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])

    details = []
    before = get_platform_settings()
    after = dict(before)

    if "grace_period_days" in payload:
        val = payload.get("grace_period_days")
        if not isinstance(val, int) or val < 0 or val > 90:
            details.append({"field": "grace_period_days", "code": "invalid", "message": "Must be an integer between 0 and 90."})
        else:
            after["grace_period_days"] = val

    if "company_registration_enabled" in payload:
        val = payload.get("company_registration_enabled")
        if not isinstance(val, bool):
            details.append({"field": "company_registration_enabled", "code": "invalid", "message": "Must be true or false."})
        else:
            after["company_registration_enabled"] = val

    if "default_plan_code" in payload:
        val = str(payload.get("default_plan_code") or "").strip()
        if not val:
            details.append({"field": "default_plan_code", "code": "required", "message": "Enter a plan code."})
        else:
            after["default_plan_code"] = val

    if "maintenance_mode" in payload:
        val = payload.get("maintenance_mode")
        if not isinstance(val, bool):
            details.append({"field": "maintenance_mode", "code": "invalid", "message": "Must be true or false."})
        else:
            after["maintenance_mode"] = val

    if "platform_banner_message" in payload:
        val = str(payload.get("platform_banner_message") or "").strip()[:500]
        after["platform_banner_message"] = val

    if details:
        raise validation_error(details)

    with transaction.atomic():
        for key, val in after.items():
            PlatformSetting.objects.update_or_create(
                key=key,
                defaults={"value": {"value": val}, "updated_by": actor},
            )

        AuditLog.objects.create(
            company=None,
            actor=actor,
            action="platform.settings.updated",
            object_type="platform_settings",
            object_id=None,
            before=before,
            after=after,
        )

    return get_platform_settings()


def platform_health_overview() -> dict:
    start = time.time()
    db_ok = True
    db_latency_ms = 0
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        db_latency_ms = round((time.time() - start) * 1000, 2)
    except Exception:
        db_ok = False

    now = timezone.now()
    yesterday = now - timedelta(days=1)
    recent_audits = AuditLog.objects.filter(created_at__gte=yesterday).count()

    total_companies = Company.objects.count()
    active_companies = Company.objects.filter(status=CompanyStatus.ACTIVE).count()

    return {
        "status": "healthy" if db_ok else "unhealthy",
        "app_version": "0.1.0",
        "timestamp": now.isoformat(),
        "database": {
            "connected": db_ok,
            "engine": connection.vendor,
            "latency_ms": db_latency_ms,
        },
        "operations": {
            "total_companies": total_companies,
            "active_companies": active_companies,
            "audits_last_24h": recent_audits,
        },
    }


def onboarding_monitoring() -> dict:
    draft_companies = Company.objects.filter(status=CompanyStatus.DRAFT).order_by("-created_at")
    pending_invites = MembershipInvitation.objects.filter(status=InvitationStatus.PENDING).count()

    companies_data = []
    for comp in draft_companies[:50]:
        state = getattr(comp, "onboarding_state", None)
        companies_data.append(
            {
                "id": str(comp.id),
                "display_name": comp.display_name,
                "slug": comp.slug,
                "created_at": comp.created_at.isoformat() if comp.created_at else None,
                "owner_email": comp.created_by.email if comp.created_by else "",
                "profile_completed": bool(state and state.profile_completed_at),
                "plan_selected": bool(state and state.plan_selected_at),
                "subscription_activated": bool(state and state.subscription_activated_at),
            }
        )

    return {
        "draft_companies_count": draft_companies.count(),
        "pending_invitations_count": pending_invites,
        "companies": companies_data,
    }

