from datetime import timedelta
from django.db import transaction
from django.db.models import Q
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
from apps.billing.services import ensure_growth_plan
from apps.identity.models import User
from apps.tenants.models import Company
from common.api.errors import conflict, not_found, validation_error
from common.api.pagination import page_errors, paginate


def _iso(value):
    if value is None:
        return None
    return value.isoformat()


def billing_overview() -> dict:
    ensure_growth_plan()
    now = timezone.now()

    # 1. Committed MRR calculation per docs/architecture/10-platform-administration.md
    active_items = (
        SubscriptionItem.objects.filter(
            subscription__status=SubscriptionStatus.ACTIVE,
            status__in=[SubscriptionItemStatus.ACTIVE, SubscriptionItemStatus.CANCEL_SCHEDULED],
        )
        .select_related("subscription")
    )

    committed_mrr_minor = 0
    mrr_residual_minor = 0
    for item in active_items:
        qty = item.quantity or 1
        amount = (item.unit_amount_minor or 0) * qty
        if item.billing_interval == BillingInterval.MONTH:
            committed_mrr_minor += amount
        elif item.billing_interval == BillingInterval.YEAR:
            committed_mrr_minor += amount // 12
            mrr_residual_minor += amount % 12

    # 2. MRR at risk (past_due subscriptions)
    past_due_items = (
        SubscriptionItem.objects.filter(
            subscription__status=SubscriptionStatus.PAST_DUE,
            status__in=[SubscriptionItemStatus.ACTIVE, SubscriptionItemStatus.CANCEL_SCHEDULED],
        )
        .select_related("subscription")
    )
    mrr_at_risk_minor = 0
    for item in past_due_items:
        qty = item.quantity or 1
        amount = (item.unit_amount_minor or 0) * qty
        if item.billing_interval == BillingInterval.MONTH:
            mrr_at_risk_minor += amount
        elif item.billing_interval == BillingInterval.YEAR:
            mrr_at_risk_minor += amount // 12

    # 3. Counts by status
    by_status = {choice.value: 0 for choice in SubscriptionStatus}
    for sub in Subscription.objects.all():
        if sub.status in by_status:
            by_status[sub.status] += 1

    # 4. Renewals in next 30 days
    in_30_days = now + timedelta(days=30)
    expiring_soon = (
        Subscription.objects.filter(
            status__in=[SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
            current_period_end__gte=now,
            current_period_end__lte=in_30_days,
        )
        .count()
    )

    return {
        "committed_mrr_minor": committed_mrr_minor,
        "committed_arr_minor": committed_mrr_minor * 12,
        "mrr_residual_minor": mrr_residual_minor,
        "mrr_at_risk_minor": mrr_at_risk_minor,
        "currency": "INR",
        "subscriptions_count": {
            "total": sum(by_status.values()),
            "active": by_status.get(SubscriptionStatus.ACTIVE, 0),
            "trialing": by_status.get(SubscriptionStatus.TRIALING, 0),
            "past_due": by_status.get(SubscriptionStatus.PAST_DUE, 0),
            "canceled": by_status.get(SubscriptionStatus.CANCELED, 0),
            "incomplete": by_status.get(SubscriptionStatus.INCOMPLETE, 0),
            "unpaid": by_status.get(SubscriptionStatus.UNPAID, 0),
            "expiring_in_30_days": expiring_soon,
        },
    }


def list_platform_subscriptions(*, query_params) -> dict:
    details = page_errors(query_params.get("page"), query_params.get("page_size"))
    if details:
        raise validation_error(details)

    ensure_growth_plan()
    queryset = (
        Subscription.objects.select_related("company", "plan", "plan_price")
        .order_by("-created_at", "id")
    )

    search = (query_params.get("q") or "").strip()
    if search:
        queryset = queryset.filter(
            Q(company__display_name__icontains=search)
            | Q(company__slug__icontains=search)
            | Q(plan__name__icontains=search)
        )

    status = (query_params.get("status") or "").strip()
    if status:
        queryset = queryset.filter(status=status)

    plan_code = (query_params.get("plan_code") or "").strip()
    if plan_code:
        queryset = queryset.filter(plan__code=plan_code)

    interval = (query_params.get("interval") or "").strip()
    if interval:
        queryset = queryset.filter(billing_interval=interval)

    page = paginate(queryset, page_raw=query_params.get("page"), page_size_raw=query_params.get("page_size"))
    page["results"] = [
        {
            "id": str(sub.id),
            "company_id": str(sub.company_id),
            "company_name": sub.company.display_name,
            "company_slug": sub.company.slug,
            "company_status": sub.company.status,
            "plan_code": sub.plan.code,
            "plan_name": sub.plan.name,
            "billing_interval": sub.billing_interval,
            "currency": sub.currency,
            "amount_minor": sub.plan_price.amount_minor if sub.plan_price else 0,
            "status": sub.status,
            "current_period_start": _iso(sub.current_period_start),
            "current_period_end": _iso(sub.current_period_end),
            "trial_ends_at": _iso(sub.trial_ends_at),
            "cancel_at_period_end": sub.cancel_at_period_end,
            "created_at": _iso(sub.created_at),
        }
        for sub in page["results"]
    ]
    return page


def list_platform_plans() -> dict:
    ensure_growth_plan()
    plans = BillingPlan.objects.all().order_by("code")
    results = []
    for plan in plans:
        prices = [
            {
                "id": str(p.id),
                "billing_interval": p.billing_interval,
                "currency": p.currency,
                "amount_minor": p.amount_minor,
                "is_active": p.is_active,
            }
            for p in plan.prices.filter(is_active=True).order_by("billing_interval")
        ]
        entitlements = {e.entitlement_key: e.entitlement_value for e in plan.entitlements.all()}
        sub_count = Subscription.objects.filter(plan=plan).exclude(status=SubscriptionStatus.CANCELED).count()
        results.append(
            {
                "id": str(plan.id),
                "code": plan.code,
                "name": plan.name,
                "description": plan.description,
                "is_active": plan.is_active,
                "is_public": plan.is_public,
                "trial_days": plan.trial_days,
                "prices": prices,
                "entitlements": entitlements,
                "active_subscriptions_count": sub_count,
            }
        )
    return {"results": results, "count": len(results)}


def change_company_subscription_plan(*, actor: User, company_id, payload: dict, request) -> dict:
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])

    plan_code = str(payload.get("plan_code") or "").strip()
    interval = str(payload.get("billing_interval") or payload.get("interval") or "").strip()
    if not plan_code:
        raise validation_error([{"field": "plan_code", "code": "required", "message": "Choose a plan."}])
    if interval not in {BillingInterval.MONTH, BillingInterval.YEAR}:
        raise validation_error([{"field": "billing_interval", "code": "invalid", "message": "Choose month or year."}])

    company = Company.objects.filter(pk=company_id).first()
    if company is None:
        raise not_found("That company was not found.")

    price = (
        BillingPlanPrice.objects.select_related("plan")
        .filter(
            plan__code=plan_code,
            billing_interval=interval,
            currency="INR",
            is_active=True,
        )
        .first()
    )
    if price is None:
        raise validation_error(
            [{"field": "plan_code", "code": "invalid", "message": "Selected plan price is not available."}]
        )

    now = timezone.now()
    plan = price.plan
    trial = plan.trial_days > 0
    status = SubscriptionStatus.TRIALING if trial else SubscriptionStatus.ACTIVE
    period_end = now + timedelta(days=plan.trial_days if trial else 30 if interval == BillingInterval.MONTH else 365)

    with transaction.atomic():
        sub = (
            Subscription.objects.select_for_update()
            .filter(company=company)
            .exclude(status=SubscriptionStatus.CANCELED)
            .first()
        )
        previous_status = sub.status if sub else None
        previous_plan_code = sub.plan.code if sub else None

        if sub is None:
            sub = Subscription.objects.create(
                company=company,
                plan=plan,
                plan_price=price,
                billing_interval=interval,
                currency="INR",
                status=status,
                provider="pulse",
                trial_ends_at=period_end if trial else None,
                current_period_start=now,
                current_period_end=period_end,
            )
        else:
            sub.plan = plan
            sub.plan_price = price
            sub.billing_interval = interval
            sub.currency = "INR"
            sub.status = status
            sub.trial_ends_at = period_end if trial else None
            sub.current_period_start = now
            sub.current_period_end = period_end
            sub.save()

        SubscriptionItem.objects.filter(subscription=sub, item_type="plan").delete()
        SubscriptionItem.objects.create(
            company=company,
            subscription=sub,
            item_type="plan",
            plan_price=price,
            description=plan.name,
            billing_interval=interval,
            currency="INR",
            unit_amount_minor=price.amount_minor,
            quantity=1,
            status=SubscriptionItemStatus.ACTIVE,
            effective_at=now,
        )

        SubscriptionStatusEvent.objects.create(
            company=company,
            subscription=sub,
            from_status=previous_status,
            to_status=status,
            reason="platform_plan_change",
            actor=actor,
        )

        AuditLog.objects.create(
            company=company,
            actor=actor,
            action="platform.subscription.plan_changed",
            object_type="subscription",
            object_id=sub.id,
            before={"plan_code": previous_plan_code, "status": previous_status},
            after={"plan_code": plan.code, "billing_interval": interval, "status": status},
        )

    return {
        "subscription_id": str(sub.id),
        "plan_code": plan.code,
        "plan_name": plan.name,
        "billing_interval": interval,
        "status": status,
        "current_period_end": _iso(period_end),
    }
