from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.billing.models import (
    BillingInterval,
    BillingPlan,
    BillingPlanPrice,
    Subscription,
    SubscriptionItem,
    SubscriptionItemStatus,
    SubscriptionStatus,
    SubscriptionStatusEvent,
)
from apps.tenants.models import CompanyStatus
from apps.tenants.services import _ip, _owned_onboarding, _request_id
from common.api.errors import conflict, validation_error

TRIAL_PROVIDER = "pulse"


def list_public_plans() -> dict:
    now = timezone.now()
    plans = BillingPlan.objects.filter(is_active=True, is_public=True).order_by("code")
    results = []
    for plan in plans:
        prices = plan.prices.filter(is_active=True, currency="INR", effective_from__lte=now, effective_to=None).order_by("billing_interval")
        entitlements = {row.entitlement_key: row.entitlement_value for row in plan.entitlements.all()}
        results.append(
            {
                "code": plan.code,
                "name": plan.name,
                "description": plan.description,
                "trial_days": plan.trial_days,
                "prices": [
                    {"billing_interval": price.billing_interval, "currency": price.currency, "amount_minor": price.amount_minor}
                    for price in prices
                ],
                "entitlements": entitlements,
            }
        )
    return {"results": results}


def select_plan(*, user, payload: dict, request) -> dict:
    company, state = _owned_onboarding(user)
    if state.billing_profile_completed_at is None:
        raise conflict("Complete the billing profile before choosing a plan.")
    plan_code, interval = _selection(payload)
    now = timezone.now()
    price = (
        BillingPlanPrice.objects.select_related("plan")
        .filter(
            plan__code=plan_code,
            plan__is_active=True,
            plan__is_public=True,
            billing_interval=interval,
            currency="INR",
            is_active=True,
            effective_from__lte=now,
            effective_to=None,
        )
        .first()
    )
    if price is None:
        raise validation_error([{"field": "plan_code", "code": "invalid", "message": "Choose an available plan and interval."}])
    plan = price.plan
    trial = plan.trial_days > 0
    status = SubscriptionStatus.TRIALING if trial else SubscriptionStatus.INCOMPLETE
    period_end = now + timedelta(days=plan.trial_days) if trial else None
    with transaction.atomic():
        subscription = (
            Subscription.objects.select_for_update()
            .filter(company=company)
            .exclude(status=SubscriptionStatus.CANCELED)
            .first()
        )
        previous = subscription.status if subscription else None
        if subscription is None:
            subscription = Subscription.objects.create(
                company=company,
                plan=plan,
                plan_price=price,
                billing_interval=interval,
                currency="INR",
                status=status,
                provider=TRIAL_PROVIDER,
                trial_ends_at=period_end,
                current_period_start=now if trial else None,
                current_period_end=period_end,
            )
        else:
            subscription.plan = plan
            subscription.plan_price = price
            subscription.billing_interval = interval
            subscription.currency = "INR"
            subscription.status = status
            subscription.trial_ends_at = period_end
            subscription.current_period_start = now if trial else None
            subscription.current_period_end = period_end
            subscription.save()
        SubscriptionItem.objects.filter(subscription=subscription, item_type="plan").delete()
        SubscriptionItem.objects.create(
            company=company,
            subscription=subscription,
            item_type="plan",
            plan_price=price,
            description=plan.name,
            billing_interval=interval,
            currency="INR",
            unit_amount_minor=price.amount_minor,
            quantity=1,
            status=SubscriptionItemStatus.ACTIVE if trial else SubscriptionItemStatus.PENDING,
            effective_at=now,
        )
        SubscriptionStatusEvent.objects.create(
            company=company,
            subscription=subscription,
            from_status=previous,
            to_status=status,
            reason="plan_selected",
            actor=user,
        )
        if state.plan_selected_at is None:
            state.plan_selected_at = now
        if trial:
            state.subscription_activated_at = state.subscription_activated_at or now
            if company.status == CompanyStatus.DRAFT:
                company.status = CompanyStatus.ACTIVE
                company.save(update_fields=["status", "updated_at"])
        state.save(update_fields=["plan_selected_at", "subscription_activated_at", "updated_at"])
        AuditLog.objects.create(
            company=company,
            actor=user,
            action="subscription.plan_selected",
            object_type="subscription",
            object_id=subscription.id,
            after={"plan_code": plan.code, "billing_interval": interval, "status": status, "amount_minor": price.amount_minor},
            ip_address=_ip(request),
            request_id=_request_id(request),
        )
    from apps.authorization.company import bootstrap_company_access
    from apps.modules_registry.services import install_selected

    bootstrap_company_access(company, user)
    modules = install_selected(user=user, company=company, slugs=payload.get("module_slugs"), request=request)
    return {
        "plan_price_id": str(price.id),
        "billing_interval": interval,
        "currency": "INR",
        "amount_minor": price.amount_minor,
        "subscription_status": status,
        "trial_ends_at": period_end.isoformat() if period_end else None,
        "installed_modules": modules["installed"],
        "skipped_modules": modules["skipped"],
    }


def subscription_summary(company) -> dict | None:
    from apps.billing.access import current_subscription

    subscription = current_subscription(company)
    if subscription is None:
        return None
    return {
        "status": subscription.status,
        "plan_code": subscription.plan.code,
        "plan_name": subscription.plan.name,
        "billing_interval": subscription.billing_interval,
        "currency": subscription.currency,
        "amount_minor": subscription.plan_price.amount_minor,
        "trial_ends_at": subscription.trial_ends_at.isoformat() if subscription.trial_ends_at else None,
    }


def _selection(payload: dict) -> tuple[str, str]:
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])
    details = []
    plan_code = payload.get("plan_code")
    interval = payload.get("billing_interval")
    if not isinstance(plan_code, str) or not plan_code.strip():
        details.append({"field": "plan_code", "code": "required", "message": "Choose a plan."})
        plan_code = ""
    if interval not in {BillingInterval.MONTH, BillingInterval.YEAR}:
        details.append({"field": "billing_interval", "code": "invalid", "message": "Choose month or year."})
        interval = ""
    if details:
        raise validation_error(details)
    return plan_code.strip(), interval
