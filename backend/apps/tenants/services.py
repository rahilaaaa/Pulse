from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.identity.models import User
from apps.tenants.gst import GSTIN_PATTERN, INDIA_STATE_CODES
from apps.tenants.models import (
    SLUG_PATTERN,
    Company,
    CompanyBillingProfile,
    CompanyMembership,
    CompanyStatus,
    MembershipStatus,
    OnboardingState,
)
from common.api.errors import conflict, not_found, permission_denied, validation_error

COMPANY_LIMIT_MESSAGE = "This account already has a company."


def onboarding_checklist(user: User) -> dict:
    company = Company.objects.filter(created_by=user).order_by("created_at").first()
    state = None
    if company is not None:
        try:
            state = company.onboarding_state
        except ObjectDoesNotExist:
            state = None
    email_verified = user.email_verified_at is not None
    profile_completed = bool(state and state.profile_completed_at)
    billing_completed = bool(state and state.billing_profile_completed_at)
    steps = {
        "email_verified": email_verified,
        "company_created": company is not None,
        "profile_completed": profile_completed,
        "billing_profile_completed": billing_completed,
        "plan_selected": bool(state and state.plan_selected_at),
        "checkout_started": bool(state and state.checkout_started_at),
        "subscription_activated": bool(state and state.subscription_activated_at),
        "workspace_entered": bool(state and state.workspace_entered_at),
    }
    if not email_verified:
        current_step = "email"
    elif company is None:
        current_step = "company"
    elif not profile_completed:
        current_step = "profile"
    elif not billing_completed:
        current_step = "billing_profile"
    elif not steps["plan_selected"]:
        current_step = "plan"
    elif not steps["subscription_activated"]:
        current_step = "checkout"
    elif not steps["workspace_entered"]:
        current_step = "workspace"
    else:
        current_step = "done"
    billing = None
    if company is not None:
        try:
            billing = _billing_payload(company.billing_profile)
        except ObjectDoesNotExist:
            billing = None
    from apps.billing.access import access_mode, current_subscription
    from apps.billing.services import subscription_summary

    subscription = current_subscription(company)
    installed_modules = []
    if company is not None:
        from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus

        installed_modules = list(
            CompanyModuleInstallation.objects.filter(company=company, status=InstallationStatus.INSTALLED)
            .select_related("module")
            .order_by("module__display_name")
            .values_list("module__display_name", flat=True)
        )
    return {
        "company_id": str(company.id) if company else None,
        "current_step": current_step,
        "steps": steps,
        "company": _company_payload(company) if company else None,
        "billing_profile": billing,
        "subscription": subscription_summary(company) if company else None,
        "access_mode": access_mode(company, subscription),
        "installed_modules": installed_modules,
    }


def create_company(*, user: User, payload: dict, request) -> Company:
    if user.email_verified_at is None:
        raise permission_denied("Verify your email address before creating a company.")
    legal_name, display_name, slug, timezone_name = _company_fields(payload)
    now = timezone.now()
    try:
        with transaction.atomic():
            User.objects.select_for_update().get(pk=user.pk)
            if Company.objects.filter(created_by=user).exists():
                raise conflict(COMPANY_LIMIT_MESSAGE, [{"field": "slug", "code": "conflict", "message": COMPANY_LIMIT_MESSAGE}])
            if Company.objects.filter(slug=slug).exists():
                raise conflict("That slug is already in use.", [{"field": "slug", "code": "unique", "message": "Choose a different slug."}])
            company = Company.objects.create(
                slug=slug,
                legal_name=legal_name,
                display_name=display_name,
                status=CompanyStatus.DRAFT,
                timezone=timezone_name,
                created_by=user,
            )
            CompanyMembership.objects.create(
                company=company,
                user=user,
                status=MembershipStatus.ACTIVE,
                joined_at=now,
            )
            OnboardingState.objects.create(
                company=company,
                owner=user,
                email_verified_at=user.email_verified_at,
                company_created_at=now,
            )
            AuditLog.objects.create(
                company=company,
                actor=user,
                action="company.created",
                object_type="company",
                object_id=company.id,
                after={"slug": company.slug, "display_name": company.display_name, "status": company.status},
                ip_address=_ip(request),
                request_id=_request_id(request),
            )
            from apps.authorization.company import bootstrap_company_access

            bootstrap_company_access(company, user)
    except IntegrityError as exc:
        raise conflict("That slug is already in use.", [{"field": "slug", "code": "unique", "message": "Choose a different slug."}]) from exc
    return company


def update_company_profile(*, user: User, payload: dict, request) -> dict:
    company, state = _owned_onboarding(user)
    legal_name, display_name, timezone_name = _profile_fields(payload)
    now = timezone.now()
    with transaction.atomic():
        company.legal_name = legal_name
        company.display_name = display_name
        company.timezone = timezone_name
        company.save(update_fields=["legal_name", "display_name", "timezone", "updated_at"])
        if state.profile_completed_at is None:
            state.profile_completed_at = now
            state.save(update_fields=["profile_completed_at", "updated_at"])
        AuditLog.objects.create(
            company=company,
            actor=user,
            action="company.profile_completed",
            object_type="company",
            object_id=company.id,
            after={"legal_name": company.legal_name, "display_name": company.display_name, "timezone": company.timezone, "status": company.status},
            ip_address=_ip(request),
            request_id=_request_id(request),
        )
    return _company_payload(company)


def _company_billing_profile(company):
    try:
        return company.billing_profile
    except ObjectDoesNotExist:
        return None


def company_settings_payload(company, *, permission_codes=None) -> dict:
    billing = _company_billing_profile(company)
    from apps.billing.services import subscription_summary

    custom_data = dict(company.custom_data or {})
    if permission_codes is not None:
        from apps.tenants.custom_data_access import load_active_definitions, serialize_custom_data
        from apps.tenants.models import FieldEntity

        custom_data = serialize_custom_data(
            load_active_definitions(company, FieldEntity.COMPANY),
            custom_data,
            entity=FieldEntity.COMPANY,
            permission_codes=permission_codes,
        )
    return {
        "legal_name": company.legal_name,
        "display_name": company.display_name,
        "slug": company.slug,
        "status": company.status,
        "timezone": company.timezone,
        "country_code": company.country_code,
        "custom_data": custom_data,
        "created_at": company.created_at.isoformat() if company.created_at else None,
        "subscription": subscription_summary(company),
        "billing_name": billing.billing_name if billing else "",
        "billing_email": billing.billing_email if billing else "",
        "gstin": (billing.gstin or "") if billing else "",
        "has_billing_profile": billing is not None,
    }


def update_company_settings(*, company, payload: dict, request) -> dict:
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])

    from apps.authorization.company import effective_permission_codes
    from apps.tenants.custom_fields import normalize_custom_data
    from apps.tenants.models import CompanyMembership, FieldEntity, MembershipStatus

    details = []
    actor_membership = (
        CompanyMembership.objects.filter(company=company, user=request.user, status=MembershipStatus.ACTIVE).first()
        if getattr(request, "user", None) and request.user.is_authenticated
        else None
    )
    codes = effective_permission_codes(actor_membership) if actor_membership else set()
    before = company_settings_payload(company, permission_codes=codes)
    company_updates = []
    billing = _company_billing_profile(company)

    if "legal_name" in payload:
        legal_name = _text(payload.get("legal_name"), "legal_name", details, maximum=255)
        if legal_name:
            company.legal_name = legal_name
            company_updates.append("legal_name")
    if "display_name" in payload:
        display_name = _text(payload.get("display_name"), "display_name", details, maximum=255)
        if display_name:
            company.display_name = display_name
            company_updates.append("display_name")
    if "timezone" in payload:
        timezone_name = _timezone(payload.get("timezone"), details)
        if timezone_name and not any(item["field"] == "timezone" for item in details):
            company.timezone = timezone_name
            company_updates.append("timezone")
    if "country_code" in payload:
        country_code = _country(payload.get("country_code"), details)
        if country_code and not any(item["field"] == "country_code" for item in details):
            company.country_code = country_code
            company_updates.append("country_code")

    if "custom_data" in payload:
        custom_data = normalize_custom_data(
            company,
            FieldEntity.COMPANY,
            payload.get("custom_data"),
            creating=False,
            existing=company.custom_data or {},
            permission_codes=codes,
        )
        if custom_data != dict(company.custom_data or {}):
            company.custom_data = custom_data
            company_updates.append("custom_data")

    billing_touched = any(key in payload for key in ("gstin", "billing_name", "billing_email"))
    if billing_touched and billing is None:
        details.append(
            {
                "field": "gstin",
                "code": "invalid",
                "message": "Complete the company billing profile before editing tax and billing contact details.",
            }
        )

    billing_updates = []
    gstin = None
    billing_name = None
    billing_email = None
    if billing is not None:
        if "gstin" in payload:
            gstin = _gstin(payload.get("gstin"), details)
            if not any(item["field"] == "gstin" for item in details):
                if gstin and billing.state_code and gstin[:2] != billing.state_code:
                    details.append(
                        {
                            "field": "gstin",
                            "code": "invalid",
                            "message": "The GSTIN state code must match the billing state.",
                        }
                    )
                else:
                    billing.gstin = gstin
                    billing_updates.append("gstin")
        if "billing_name" in payload:
            billing_name = _text(payload.get("billing_name"), "billing_name", details, maximum=255)
            if billing_name and not any(item["field"] == "billing_name" for item in details):
                billing.billing_name = billing_name
                billing_updates.append("billing_name")
        if "billing_email" in payload:
            billing_email = _email(payload.get("billing_email"), details)
            if billing_email and not any(item["field"] == "billing_email" for item in details):
                billing.billing_email = billing_email
                billing_updates.append("billing_email")
        if "country_code" in payload and company.country_code:
            billing.country_code = company.country_code
            if "country_code" not in billing_updates:
                billing_updates.append("country_code")

    if details:
        raise validation_error(details)

    with transaction.atomic():
        if company_updates:
            company_updates.append("updated_at")
            company.save(update_fields=company_updates)
        if billing is not None and billing_updates:
            billing_updates.append("updated_at")
            billing.save(update_fields=billing_updates)
        after = company_settings_payload(company, permission_codes=codes)
        audit_keys = (
            "legal_name",
            "display_name",
            "timezone",
            "country_code",
            "custom_data",
            "gstin",
            "billing_name",
            "billing_email",
        )
        AuditLog.objects.create(
            company=company,
            actor=request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
            action="company.updated",
            object_type="company",
            object_id=company.id,
            before={key: before[key] for key in audit_keys},
            after={key: after[key] for key in audit_keys},
            ip_address=_ip(request),
            request_id=_request_id(request),
        )
    return after


def save_billing_profile(*, user: User, payload: dict, request) -> dict:
    company, state = _owned_onboarding(user)
    if state.profile_completed_at is None:
        raise conflict("Complete the company profile before the billing profile.")
    fields = _billing_fields(payload)
    now = timezone.now()
    with transaction.atomic():
        profile, _created = CompanyBillingProfile.objects.update_or_create(
            company=company,
            defaults=fields,
        )
        if state.billing_profile_completed_at is None:
            state.billing_profile_completed_at = now
            state.save(update_fields=["billing_profile_completed_at", "updated_at"])
        AuditLog.objects.create(
            company=company,
            actor=user,
            action="company.billing_profile_completed",
            object_type="company_billing_profile",
            object_id=profile.id,
            after={"billing_name": profile.billing_name, "state_code": profile.state_code, "gstin_provided": bool(profile.gstin)},
            ip_address=_ip(request),
            request_id=_request_id(request),
        )
    company.refresh_from_db()
    return _billing_payload(profile)


def list_member_companies(user: User) -> dict:
    memberships = (
        CompanyMembership.objects.filter(user=user, status=MembershipStatus.ACTIVE)
        .select_related("company")
        .order_by("created_at", "id")[:100]
    )
    return {
        "results": [
            {
                "company_id": str(membership.company_id),
                "slug": membership.company.slug,
                "display_name": membership.company.display_name,
                "legal_name": membership.company.legal_name,
                "status": membership.company.status,
                "membership_status": membership.status,
            }
            for membership in memberships
        ]
    }


def get_member_company(*, user: User, company_id) -> dict:
    membership = (
        CompanyMembership.objects.filter(user=user, company_id=company_id, status=MembershipStatus.ACTIVE)
        .select_related("company")
        .first()
    )
    if membership is None:
        raise not_found()
    company = membership.company
    return {
        "id": str(company.id),
        "slug": company.slug,
        "legal_name": company.legal_name,
        "display_name": company.display_name,
        "status": company.status,
        "timezone": company.timezone,
        "country_code": company.country_code,
    }


def _owned_onboarding(user: User) -> tuple[Company, OnboardingState]:
    if user.email_verified_at is None:
        raise permission_denied("Verify your email address before continuing onboarding.")
    company = Company.objects.filter(created_by=user).order_by("created_at").first()
    if company is None:
        raise not_found("Create a company before this step.")
    try:
        state = company.onboarding_state
    except ObjectDoesNotExist:
        raise not_found("Create a company before this step.")
    if state.owner_id != user.id:
        raise not_found()
    return company, state


def _company_payload(company: Company) -> dict:
    return {
        "id": str(company.id),
        "slug": company.slug,
        "legal_name": company.legal_name,
        "display_name": company.display_name,
        "status": company.status,
        "timezone": company.timezone,
        "country_code": company.country_code,
    }


def _billing_payload(profile: CompanyBillingProfile) -> dict:
    return {
        "billing_name": profile.billing_name,
        "billing_email": profile.billing_email,
        "phone": profile.phone,
        "address_line1": profile.address_line1,
        "address_line2": profile.address_line2,
        "city": profile.city,
        "state_code": profile.state_code,
        "postal_code": profile.postal_code,
        "country_code": profile.country_code,
        "gstin": profile.gstin,
        "place_of_supply_state_code": profile.place_of_supply_state_code,
    }


def _profile_fields(payload: dict) -> tuple[str, str, str]:
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])
    details = []
    legal_name = _text(payload.get("legal_name"), "legal_name", details, maximum=255)
    display_name = _text(payload.get("display_name"), "display_name", details, maximum=255)
    timezone_name = _timezone(payload.get("timezone") or "Asia/Kolkata", details)
    if details:
        raise validation_error(details)
    return legal_name, display_name, timezone_name


def _billing_fields(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])
    details = []
    billing_name = _text(payload.get("billing_name"), "billing_name", details, maximum=255)
    billing_email = _email(payload.get("billing_email"), details)
    phone = _optional_text(payload.get("phone"), "phone", details, maximum=32)
    address_line1 = _text(payload.get("address_line1"), "address_line1", details, maximum=255)
    address_line2 = _optional_text(payload.get("address_line2"), "address_line2", details, maximum=255) or ""
    city = _text(payload.get("city"), "city", details, maximum=100)
    state_code = _state_code(payload.get("state_code"), "state_code", details)
    postal_code = _text(payload.get("postal_code"), "postal_code", details, maximum=16)
    country_code = _country(payload.get("country_code") or "IN", details)
    gstin = _gstin(payload.get("gstin"), details)
    place = payload.get("place_of_supply_state_code")
    if place in (None, ""):
        place_of_supply = state_code
    else:
        place_of_supply = _state_code(place, "place_of_supply_state_code", details)
    if country_code == "IN" and postal_code and (not postal_code.isdigit() or len(postal_code) != 6):
        details.append({"field": "postal_code", "code": "invalid", "message": "Enter a 6-digit postal code."})
    if gstin and state_code and gstin[:2] != state_code:
        details.append({"field": "gstin", "code": "invalid", "message": "The GSTIN state code must match the billing state."})
    if details:
        raise validation_error(details)
    return {
        "billing_name": billing_name,
        "billing_email": billing_email,
        "phone": phone,
        "address_line1": address_line1,
        "address_line2": address_line2,
        "city": city,
        "state_code": state_code,
        "postal_code": postal_code,
        "country_code": country_code,
        "gstin": gstin,
        "place_of_supply_state_code": place_of_supply,
    }


def _company_fields(payload: dict) -> tuple[str, str, str, str]:
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])
    details = []
    legal_name = _text(payload.get("legal_name"), "legal_name", details, maximum=255)
    display_name = _text(payload.get("display_name"), "display_name", details, maximum=255)
    slug = _text(payload.get("slug"), "slug", details, maximum=63)
    timezone_name = _timezone(payload.get("timezone") or "Asia/Kolkata", details)
    if slug and (len(slug) < 3 or SLUG_PATTERN.fullmatch(slug) is None):
        details.append({"field": "slug", "code": "invalid", "message": "Use 3 to 63 lowercase letters, numbers, and hyphens."})
    if details:
        raise validation_error(details)
    return legal_name, display_name, slug, timezone_name


def _timezone(value, details: list) -> str:
    if not isinstance(value, str) or not value.strip():
        details.append({"field": "timezone", "code": "invalid", "message": "Enter a time zone."})
        return ""
    timezone_name = value.strip()
    try:
        ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        details.append({"field": "timezone", "code": "invalid", "message": "Enter a valid IANA time zone."})
    return timezone_name


def _email(value, details: list) -> str:
    if not isinstance(value, str) or not value.strip():
        details.append({"field": "billing_email", "code": "required", "message": "Enter a billing email address."})
        return ""
    cleaned = value.strip().lower()
    try:
        validate_email(cleaned)
    except ValidationError:
        details.append({"field": "billing_email", "code": "invalid", "message": "Enter a valid email address."})
    return cleaned


def _optional_text(value, field: str, details: list, *, maximum: int) -> str | None:
    if value in (None, ""):
        return None
    if not isinstance(value, str):
        details.append({"field": field, "code": "invalid", "message": "Enter text."})
        return None
    cleaned = value.strip()
    if len(cleaned) > maximum:
        details.append({"field": field, "code": "max_length", "message": f"Enter at most {maximum} characters."})
    return cleaned or None


def _country(value, details: list) -> str:
    if not isinstance(value, str) or len(value.strip()) != 2 or not value.strip().isalpha():
        details.append({"field": "country_code", "code": "invalid", "message": "Enter a 2-letter country code."})
        return ""
    return value.strip().upper()


def _state_code(value, field: str, details: list) -> str:
    if not isinstance(value, str) or value.strip() not in INDIA_STATE_CODES:
        details.append({"field": field, "code": "invalid", "message": "Enter a GST state code."})
        return ""
    return value.strip()


def _gstin(value, details: list) -> str | None:
    if value in (None, ""):
        return None
    if not isinstance(value, str) or GSTIN_PATTERN.fullmatch(value.strip().upper()) is None:
        details.append({"field": "gstin", "code": "invalid", "message": "Enter a 15-character GSTIN, or leave it blank."})
        return None
    return value.strip().upper()


def _text(value, field: str, details: list, *, maximum: int) -> str:
    if not isinstance(value, str) or not value.strip():
        details.append({"field": field, "code": "required", "message": "This field is required."})
        return ""
    cleaned = value.strip()
    if len(cleaned) > maximum:
        details.append({"field": field, "code": "max_length", "message": f"Enter at most {maximum} characters."})
    return cleaned


def _ip(request):
    raw = (request.META.get("REMOTE_ADDR") or "").strip()
    return raw or None


def _request_id(request):
    raw = getattr(request, "request_id", None)
    if not raw:
        return None
    try:
        from uuid import UUID

        return UUID(str(raw))
    except ValueError:
        return None
