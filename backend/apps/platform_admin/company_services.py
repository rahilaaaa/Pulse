import logging
from datetime import datetime, time, timezone as datetime_timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.core.exceptions import ObjectDoesNotExist
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.utils import timezone
from django.utils.crypto import get_random_string
from django.utils.dateparse import parse_date

from apps.audit.models import AuditLog
from apps.authorization.company import bootstrap_company_access
from apps.authorization.models import CompanyRole, MembershipRoleAssignment
from apps.billing.access import current_subscription
from apps.billing.models import BillingInterval, BillingPlanPrice, SubscriptionStatus
from apps.billing.services import ensure_growth_plan, select_plan, subscription_summary
from apps.identity.models import User
from apps.identity.password_reset import _issue_reset
from apps.identity.serializers import normalize_email
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus
from apps.modules_registry.services import install_selected
from apps.organization.models import Department, Person, PersonStatus, UnitStatus
from apps.tenants.models import (
    SLUG_PATTERN,
    Company,
    CompanyMembership,
    CompanyStatus,
    InvitationStatus,
    MembershipInvitation,
    MembershipStatus,
    OnboardingState,
)
from common.api.errors import conflict, not_found, validation_error
from common.api.pagination import page_errors, paginate


def _iso(value):
    if value is None:
        return None
    return value.astimezone(datetime_timezone.utc).isoformat().replace("+00:00", "Z")


def _request_ip(request):
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return (request.META.get("REMOTE_ADDR") or "")[:64] or None


def _request_id(request):
    if request is None:
        return None
    raw = request.META.get("HTTP_X_REQUEST_ID") or request.headers.get("X-Request-Id")
    if not raw:
        return None
    try:
        import uuid

        return uuid.UUID(str(raw))
    except (TypeError, ValueError, AttributeError):
        return None


def _parse_bound(raw, *, field: str, details: list, end: bool):
    if raw is None or str(raw).strip() == "":
        return None
    parsed = parse_date(str(raw).strip())
    if parsed is None:
        details.append({"field": field, "code": "invalid", "message": "Enter a date in YYYY-MM-DD format."})
        return None
    clock = time.max if end else time.min
    value = datetime.combine(parsed, clock)
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.get_current_timezone())
    return value


COMPANY_SORTS = {
    "created_at": ("created_at", "id"),
    "-created_at": ("-created_at", "id"),
    "display_name": ("display_name", "id"),
    "-display_name": ("-display_name", "id"),
    "slug": ("slug", "id"),
    "-slug": ("-slug", "id"),
    "status": ("status", "id"),
    "-status": ("-status", "id"),
}


def list_companies(*, query_params) -> dict:
    details = []
    queryset = Company.objects.annotate(
        membership_count=Count(
            "memberships",
            filter=Q(memberships__status=MembershipStatus.ACTIVE),
        ),
        installed_modules_count=Count(
            "module_installations",
            filter=Q(module_installations__status=InstallationStatus.INSTALLED),
        ),
    )

    search = (query_params.get("q") or "").strip()
    if len(search) > 100:
        details.append({"field": "q", "code": "max_length", "message": "Enter at most 100 characters."})
    elif search:
        queryset = queryset.filter(
            Q(display_name__icontains=search) | Q(legal_name__icontains=search) | Q(slug__icontains=search)
        )

    status = (query_params.get("status") or "").strip()
    if status:
        allowed = {choice.value for choice in CompanyStatus}
        if status not in allowed:
            details.append({"field": "status", "code": "invalid", "message": "Choose a valid company status."})
        else:
            queryset = queryset.filter(status=status)

    plan = (query_params.get("plan") or "").strip()
    if plan:
        queryset = queryset.filter(subscriptions__plan__code=plan).exclude(subscriptions__status=SubscriptionStatus.CANCELED)

    subscription_status = (query_params.get("subscription_status") or "").strip()
    if subscription_status:
        queryset = queryset.filter(subscriptions__status=subscription_status)

    module_slug = (query_params.get("module") or "").strip()
    if module_slug:
        queryset = queryset.filter(
            module_installations__module_id=module_slug,
            module_installations__status=InstallationStatus.INSTALLED,
        )

    created_from = _parse_bound(query_params.get("created_from"), field="created_from", details=details, end=False)
    created_to = _parse_bound(query_params.get("created_to"), field="created_to", details=details, end=True)
    if created_from and created_to and created_from > created_to:
        details.append(
            {"field": "created_to", "code": "invalid", "message": "The end date must be on or after the start date."}
        )
    if created_from:
        queryset = queryset.filter(created_at__gte=created_from)
    if created_to:
        queryset = queryset.filter(created_at__lte=created_to)

    sort = query_params.get("sort") or "-created_at"
    if sort not in COMPANY_SORTS:
        details.append({"field": "sort", "code": "invalid", "message": "Choose a valid sort field."})
    details.extend(page_errors(query_params.get("page"), query_params.get("page_size")))

    if details:
        raise validation_error(details)

    queryset = queryset.order_by(*COMPANY_SORTS[sort])
    page = paginate(queryset, page_raw=query_params.get("page"), page_size_raw=query_params.get("page_size"))
    page["results"] = [_serialize_company_row(company) for company in page["results"]]
    return page


def _serialize_company_row(company: Company) -> dict:
    sub = current_subscription(company)
    sub_data = None
    if sub:
        sub_data = {
            "plan_code": sub.plan.code,
            "plan_name": sub.plan.name,
            "status": sub.status,
            "billing_interval": sub.billing_interval,
            "currency": sub.currency,
        }
    return {
        "id": str(company.id),
        "display_name": company.display_name,
        "legal_name": company.legal_name,
        "slug": company.slug,
        "status": company.status,
        "country_code": company.country_code,
        "timezone": company.timezone,
        "created_at": _iso(company.created_at),
        "suspended_at": _iso(company.suspended_at),
        "closed_at": _iso(company.closed_at),
        "membership_count": getattr(company, "membership_count", 0),
        "installed_modules_count": getattr(company, "installed_modules_count", 0),
        "subscription": sub_data,
    }


def get_company_detail(*, company_id) -> dict:
    """Privacy-safe company detail view.

    Returns metadata and aggregate member metrics ONLY. NEVER dumps all individual employee
    records.
    """
    company = Company.objects.filter(pk=company_id).first()
    if company is None:
        raise not_found("That company was not found.")

    memberships = CompanyMembership.objects.filter(company=company)
    active_memberships = memberships.filter(status=MembershipStatus.ACTIVE)
    pending_invites = MembershipInvitation.objects.filter(
        company=company, status=InvitationStatus.PENDING
    ).count()

    # Aggregate counts
    total_members = memberships.exclude(status=MembershipStatus.REMOVED).count()
    active_members = active_memberships.count()
    owner_count = (
        MembershipRoleAssignment.objects.filter(
            membership__company=company,
            membership__status=MembershipStatus.ACTIVE,
            role__is_owner_role=True,
        )
        .values("membership_id")
        .distinct()
        .count()
    )
    manager_count = (
        MembershipRoleAssignment.objects.filter(
            membership__company=company,
            membership__status=MembershipStatus.ACTIVE,
            role__name__icontains="manager",
        )
        .values("membership_id")
        .distinct()
        .count()
    )

    sub = current_subscription(company)
    sub_summary = subscription_summary(company)

    installed_count = CompanyModuleInstallation.objects.filter(
        company=company, status=InstallationStatus.INSTALLED
    ).count()

    return {
        "id": str(company.id),
        "display_name": company.display_name,
        "legal_name": company.legal_name,
        "slug": company.slug,
        "status": company.status,
        "country_code": company.country_code,
        "timezone": company.timezone,
        "created_at": _iso(company.created_at),
        "suspended_at": _iso(company.suspended_at),
        "closed_at": _iso(company.closed_at),
        "installed_modules_count": installed_count,
        "subscription": sub_summary,
        "member_summary": {
            "total_members": total_members,
            "active_members": active_members,
            "pending_invitations": pending_invites,
            "owners_count": owner_count,
            "managers_count": manager_count,
        },
    }



COUNTRY_ALIASES = {
    "INDIA": "IN",
    "IND": "IN",
    "UNITED STATES": "US",
    "UNITED STATES OF AMERICA": "US",
    "USA": "US",
    "UNITED KINGDOM": "GB",
    "UK": "GB",
    "GREAT BRITAIN": "GB",
    "UNITED ARAB EMIRATES": "AE",
    "UAE": "AE",
    "SINGAPORE": "SG",
    "SGP": "SG",
    "GERMANY": "DE",
    "DEU": "DE",
    "FRANCE": "FR",
    "FRA": "FR",
    "CANADA": "CA",
    "CAN": "CA",
    "AUSTRALIA": "AU",
    "AUS": "AU",
    "SAUDI ARABIA": "SA",
    "KSA": "SA",
    "QATAR": "QA",
    "KUWAIT": "KW",
    "BAHRAIN": "BH",
    "OMAN": "OM",
    "MALAYSIA": "MY",
    "INDONESIA": "ID",
    "PHILIPPINES": "PH",
    "NETHERLANDS": "NL",
    "SWITZERLAND": "CH",
    "IRELAND": "IE",
    "JAPAN": "JP",
    "CHINA": "CN",
    "BRAZIL": "BR",
    "SOUTH AFRICA": "ZA",
    "NEW ZEALAND": "NZ",
}

def create_platform_company(*, actor: User, payload: dict, request) -> dict:
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])

    details = []
    display_name = str(payload.get("display_name") or "").strip()
    if not display_name:
        details.append({"field": "display_name", "code": "required", "message": "Enter a company name."})
    elif len(display_name) > 255:
        details.append({"field": "display_name", "code": "max_length", "message": "Enter at most 255 characters."})

    legal_name = str(payload.get("legal_name") or "").strip() or display_name
    if len(legal_name) > 255:
        details.append({"field": "legal_name", "code": "max_length", "message": "Enter at most 255 characters."})

    slug = str(payload.get("slug") or "").strip().lower()
    if not slug:
        details.append({"field": "slug", "code": "required", "message": "Enter a company slug."})
    elif len(slug) > 63 or not SLUG_PATTERN.match(slug):
        details.append(
            {
                "field": "slug",
                "code": "invalid",
                "message": "Use lowercase letters, numbers, and single hyphens.",
            }
        )

    timezone_name = str(payload.get("timezone") or "Asia/Kolkata").strip()
    try:
        ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        details.append({"field": "timezone", "code": "invalid", "message": "Choose a valid timezone."})

    raw_country = str(payload.get("country_code") or payload.get("country") or "IN").strip().upper()
    country_code = COUNTRY_ALIASES.get(raw_country, raw_country)
    if len(country_code) != 2 or not country_code.isalpha():
        details.append({"field": "country_code", "code": "invalid", "message": "Choose a valid 2-letter country code (e.g. IN)."})

    owner_email_raw = payload.get("owner_email") or payload.get("primary_owner_email")
    if not isinstance(owner_email_raw, str) or "@" not in owner_email_raw:
        details.append({"field": "owner_email", "code": "invalid", "message": "Enter a valid owner email address."})
    owner_email = normalize_email(owner_email_raw) if owner_email_raw else ""

    owner_first_name = str(payload.get("owner_first_name") or payload.get("primary_owner_first_name") or "").strip()[:150]
    owner_last_name = str(payload.get("owner_last_name") or payload.get("primary_owner_last_name") or "").strip()[:150]

    plan_code = str(payload.get("initial_plan_code") or "growth").strip()
    initial_modules = payload.get("initial_modules") or ["hrms", "projects"]
    if not isinstance(initial_modules, list):
        details.append({"field": "initial_modules", "code": "invalid", "message": "Send a list of module slugs."})

    if details:
        raise validation_error(details)

    now = timezone.now()
    ensure_growth_plan()

    with transaction.atomic():
        if Company.objects.filter(slug=slug).exists():
            raise conflict("That slug is already in use.", [{"field": "slug", "code": "unique", "message": "Choose a different slug."}])

        # Owner user lookup or provision
        owner = User.objects.filter(email=owner_email).first()
        owner_created = False
        if owner is None:
            owner = User.objects.create_user(
                email=owner_email,
                password=get_random_string(40),
                first_name=owner_first_name,
                last_name=owner_last_name,
            )
            owner.set_unusable_password()
            owner.email_verified_at = now
            owner.save(update_fields=["password", "email_verified_at", "updated_at"])
            owner_created = True

        company = Company.objects.create(
            slug=slug,
            legal_name=legal_name,
            display_name=display_name,
            status=CompanyStatus.ACTIVE,
            timezone=timezone_name,
            country_code=country_code,
            created_by=actor,
        )

        CompanyMembership.objects.create(
            company=company,
            user=owner,
            status=MembershipStatus.ACTIVE,
            joined_at=now,
        )

        OnboardingState.objects.create(
            company=company,
            owner=owner,
            email_verified_at=now,
            company_created_at=now,
            profile_completed_at=now,
            workspace_entered_at=now,
        )

        # Bootstrap permissions and role
        bootstrap_company_access(company, owner)

        # Apply initial subscription
        price = (
            BillingPlanPrice.objects.select_related("plan")
            .filter(
                plan__code=plan_code,
                billing_interval=BillingInterval.MONTH,
                currency="INR",
                is_active=True,
            )
            .first()
        )
        if price:
            from apps.billing.models import Subscription, SubscriptionItem, SubscriptionItemStatus, SubscriptionStatusEvent

            trial_days = price.plan.trial_days or 14
            period_end = now + timezone.timedelta(days=trial_days)
            sub = Subscription.objects.create(
                company=company,
                plan=price.plan,
                plan_price=price,
                billing_interval=BillingInterval.MONTH,
                currency="INR",
                status=SubscriptionStatus.TRIALING,
                provider="pulse",
                trial_ends_at=period_end,
                current_period_start=now,
                current_period_end=period_end,
            )
            SubscriptionItem.objects.create(
                company=company,
                subscription=sub,
                item_type="plan",
                plan_price=price,
                description=price.plan.name,
                billing_interval=BillingInterval.MONTH,
                currency="INR",
                unit_amount_minor=price.amount_minor,
                quantity=1,
                status=SubscriptionItemStatus.ACTIVE,
                effective_at=now,
            )
            SubscriptionStatusEvent.objects.create(
                company=company,
                subscription=sub,
                from_status=None,
                to_status=SubscriptionStatus.TRIALING,
                reason="platform_provisioning",
                actor=actor,
            )

        # Install initial modules
        install_selected(user=owner, company=company, slugs=initial_modules, request=request)

        AuditLog.objects.create(
            company=company,
            actor=actor,
            action="company.created",
            object_type="company",
            object_id=company.id,
            after={
                "slug": company.slug,
                "display_name": company.display_name,
                "status": company.status,
                "owner_email": owner.email,
                "provisioned_by_platform": True,
            },
            ip_address=_request_ip(request),
            request_id=_request_id(request),
        )

    if owner_created:
        try:
            _issue_reset(
                owner,
                subject="Your Pulse company workspace is ready",
                message=(
                    f"You have been designated as the owner of {display_name} on Pulse.\n\n"
                    "Use this link to set your password and access your company workspace:\n\n"
                    "{link}\n\n"
                    "This link expires in {hours} hours."
                ),
            )
        except Exception as exc:
            logger.warning("Welcome reset email to %s could not be sent: %s", owner.email, exc)

    return get_company_detail(company_id=company.id)


def update_company_metadata(*, actor: User, company_id, payload: dict, request) -> dict:
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])

    company = Company.objects.filter(pk=company_id).first()
    if company is None:
        raise not_found("That company was not found.")

    details = []
    before = {
        "display_name": company.display_name,
        "legal_name": company.legal_name,
        "timezone": company.timezone,
        "country_code": company.country_code,
    }
    updates = []

    if "display_name" in payload:
        display_name = str(payload.get("display_name") or "").strip()
        if not display_name:
            details.append({"field": "display_name", "code": "required", "message": "Enter a company name."})
        elif len(display_name) > 255:
            details.append({"field": "display_name", "code": "max_length", "message": "Enter at most 255 characters."})
        else:
            company.display_name = display_name
            updates.append("display_name")

    if "legal_name" in payload:
        legal_name = str(payload.get("legal_name") or "").strip()
        if not legal_name:
            details.append({"field": "legal_name", "code": "required", "message": "Enter a legal name."})
        elif len(legal_name) > 255:
            details.append({"field": "legal_name", "code": "max_length", "message": "Enter at most 255 characters."})
        else:
            company.legal_name = legal_name
            updates.append("legal_name")

    if "timezone" in payload:
        tz_name = str(payload.get("timezone") or "").strip()
        try:
            ZoneInfo(tz_name)
            company.timezone = tz_name
            updates.append("timezone")
        except ZoneInfoNotFoundError:
            details.append({"field": "timezone", "code": "invalid", "message": "Choose a valid timezone."})

    if "country_code" in payload:
        raw_country = str(payload.get("country_code") or "").strip().upper()
        country = COUNTRY_ALIASES.get(raw_country, raw_country)
        if len(country) != 2 or not country.isalpha():
            details.append({"field": "country_code", "code": "invalid", "message": "Enter a 2-letter country code (e.g. IN)."})
        else:
            company.country_code = country
            updates.append("country_code")

    if details:
        raise validation_error(details)

    if updates:
        updates.append("updated_at")
        with transaction.atomic():
            company.save(update_fields=updates)
            after = {
                "display_name": company.display_name,
                "legal_name": company.legal_name,
                "timezone": company.timezone,
                "country_code": company.country_code,
            }
            AuditLog.objects.create(
                company=company,
                actor=actor,
                action="company.updated",
                object_type="company",
                object_id=company.id,
                before=before,
                after=after,
                ip_address=_request_ip(request),
                request_id=_request_id(request),
            )

    return get_company_detail(company_id=company.id)


def activate_company(*, actor: User, company_id, request) -> dict:
    company = Company.objects.filter(pk=company_id).first()
    if company is None:
        raise not_found("That company was not found.")

    if company.status == CompanyStatus.ACTIVE:
        return get_company_detail(company_id=company.id)

    with transaction.atomic():
        before_status = company.status
        company.status = CompanyStatus.ACTIVE
        company.suspended_at = None
        if isinstance(company.custom_data, dict) and "suspension_reason" in company.custom_data:
            company.custom_data.pop("suspension_reason", None)
        company.save(update_fields=["status", "suspended_at", "custom_data", "updated_at"])

        AuditLog.objects.create(
            company=company,
            actor=actor,
            action="company.activated",
            object_type="company",
            object_id=company.id,
            before={"status": before_status},
            after={"status": company.status},
            ip_address=_request_ip(request),
            request_id=_request_id(request),
        )

    return get_company_detail(company_id=company.id)


def suspend_company(*, actor: User, company_id, payload: dict, request) -> dict:
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])

    reason = str(payload.get("reason") or "").strip()
    if len(reason) < 10:
        raise validation_error(
            [
                {
                    "field": "reason",
                    "code": "too_short",
                    "message": "Enter a suspension reason of at least 10 characters.",
                }
            ]
        )

    company = Company.objects.filter(pk=company_id).first()
    if company is None:
        raise not_found("That company was not found.")

    if company.status == CompanyStatus.SUSPENDED:
        raise conflict("That company is already suspended.")
    if company.status == CompanyStatus.CLOSED:
        raise conflict("A closed company cannot be suspended.")

    now = timezone.now()
    with transaction.atomic():
        before_status = company.status
        company.status = CompanyStatus.SUSPENDED
        company.suspended_at = now
        if not isinstance(company.custom_data, dict):
            company.custom_data = {}
        company.custom_data["suspension_reason"] = reason
        company.save(update_fields=["status", "suspended_at", "custom_data", "updated_at"])

        AuditLog.objects.create(
            company=company,
            actor=actor,
            action="company.suspended",
            object_type="company",
            object_id=company.id,
            before={"status": before_status},
            after={"status": company.status, "reason": reason, "suspended_at": _iso(now)},
            ip_address=_request_ip(request),
            request_id=_request_id(request),
        )

    return get_company_detail(company_id=company.id)


def reactivate_company(*, actor: User, company_id, request) -> dict:
    company = Company.objects.filter(pk=company_id).first()
    if company is None:
        raise not_found("That company was not found.")

    if company.status != CompanyStatus.SUSPENDED:
        raise conflict("Only suspended companies can be reactivated.")

    with transaction.atomic():
        before_status = company.status
        company.status = CompanyStatus.ACTIVE
        company.suspended_at = None
        if isinstance(company.custom_data, dict) and "suspension_reason" in company.custom_data:
            company.custom_data.pop("suspension_reason", None)
        company.save(update_fields=["status", "suspended_at", "custom_data", "updated_at"])

        AuditLog.objects.create(
            company=company,
            actor=actor,
            action="company.reactivated",
            object_type="company",
            object_id=company.id,
            before={"status": before_status},
            after={"status": company.status},
            ip_address=_request_ip(request),
            request_id=_request_id(request),
        )

    return get_company_detail(company_id=company.id)


def close_company(*, actor: User, company_id, payload: dict, request) -> dict:
    company = Company.objects.filter(pk=company_id).first()
    if company is None:
        raise not_found("That company was not found.")

    if company.status == CompanyStatus.CLOSED:
        raise conflict("That company is already closed.")

    reason = str(payload.get("reason") or "Closed by platform administrator").strip() if isinstance(payload, dict) else "Closed by platform administrator"

    now = timezone.now()
    with transaction.atomic():
        before_status = company.status
        company.status = CompanyStatus.CLOSED
        company.closed_at = now
        if not isinstance(company.custom_data, dict):
            company.custom_data = {}
        company.custom_data["closure_reason"] = reason
        company.save(update_fields=["status", "closed_at", "custom_data", "updated_at"])

        AuditLog.objects.create(
            company=company,
            actor=actor,
            action="company.closed",
            object_type="company",
            object_id=company.id,
            before={"status": before_status},
            after={"status": company.status, "reason": reason, "closed_at": _iso(now)},
            ip_address=_request_ip(request),
            request_id=_request_id(request),
        )

    return get_company_detail(company_id=company.id)


def list_company_audit_logs(*, company_id, query_params) -> dict:
    details = page_errors(query_params.get("page"), query_params.get("page_size"))
    if details:
        raise validation_error(details)

    company = Company.objects.filter(pk=company_id).first()
    if company is None:
        raise not_found("That company was not found.")

    queryset = (
        AuditLog.objects.filter(company=company)
        .select_related("actor")
        .order_by("-created_at", "id")
    )
    page = paginate(queryset, page_raw=query_params.get("page"), page_size_raw=query_params.get("page_size"))
    page["results"] = [
        {
            "id": str(row.id),
            "company_id": str(row.company_id),
            "actor_user_id": str(row.actor_id) if row.actor_id else None,
            "actor_email": row.actor.email if row.actor else "System",
            "actor_name": f"{row.actor.first_name} {row.actor.last_name}".strip() if row.actor else "System",
            "action": row.action,
            "object_type": row.object_type,
            "object_id": str(row.object_id) if row.object_id else None,
            "created_at": _iso(row.created_at),
            "before": row.before,
            "after": row.after,
        }
        for row in page["results"]
    ]
    return page

logger = logging.getLogger(__name__)
