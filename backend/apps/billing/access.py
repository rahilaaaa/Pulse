from apps.billing.models import Subscription, SubscriptionStatus


def current_subscription(company):
    if company is None:
        return None
    return (
        Subscription.objects.filter(company=company)
        .exclude(status=SubscriptionStatus.CANCELED)
        .select_related("plan", "plan_price")
        .order_by("-created_at")
        .first()
    )


def access_mode(company, subscription) -> str:
    if company is None:
        return "onboarding_only"
    if company.status in {"suspended", "closed"}:
        return "blocked"
    if subscription is None or subscription.status == SubscriptionStatus.INCOMPLETE:
        return "onboarding_only" if company.status == "draft" else "billing_only"
    if subscription.status in {SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE}:
        return "full"
    if subscription.status == SubscriptionStatus.PAST_DUE and subscription.grace_ends_at:
        from django.utils import timezone

        if timezone.now() < subscription.grace_ends_at:
            return "grace"
    return "billing_only"
