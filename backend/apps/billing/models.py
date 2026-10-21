import uuid

from django.conf import settings
from django.db import models


class BillingInterval(models.TextChoices):
    MONTH = "month", "Month"
    YEAR = "year", "Year"


class SubscriptionStatus(models.TextChoices):
    INCOMPLETE = "incomplete", "Incomplete"
    TRIALING = "trialing", "Trialing"
    ACTIVE = "active", "Active"
    PAST_DUE = "past_due", "Past due"
    CANCELED = "canceled", "Canceled"
    UNPAID = "unpaid", "Unpaid"


class SubscriptionItemStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    ACTIVE = "active", "Active"
    CANCEL_SCHEDULED = "cancel_scheduled", "Cancel scheduled"
    CANCELED = "canceled", "Canceled"


class BillingPlan(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    is_public = models.BooleanField(default=True)
    trial_days = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "billing_plans"


class BillingPlanPrice(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    plan = models.ForeignKey(BillingPlan, on_delete=models.PROTECT, related_name="prices")
    billing_interval = models.CharField(max_length=16, choices=BillingInterval.choices)
    currency = models.CharField(max_length=3, default="INR")
    amount_minor = models.BigIntegerField()
    provider = models.CharField(max_length=32, blank=True, null=True)
    provider_price_ref = models.CharField(max_length=255, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    effective_from = models.DateTimeField()
    effective_to = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "billing_plan_prices"
        constraints = [
            models.UniqueConstraint(
                fields=["plan", "billing_interval", "currency", "effective_from"],
                name="bill_price_version_uniq",
            ),
            models.CheckConstraint(condition=models.Q(amount_minor__gte=0), name="bill_price_amount_pos"),
            models.CheckConstraint(
                condition=models.Q(billing_interval__in=[choice.value for choice in BillingInterval]),
                name="bill_price_interval_ok",
            ),
            models.CheckConstraint(condition=models.Q(currency="INR"), name="bill_price_inr_only"),
        ]


class BillingPlanEntitlement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    plan = models.ForeignKey(BillingPlan, on_delete=models.CASCADE, related_name="entitlements")
    entitlement_key = models.CharField(max_length=100)
    entitlement_value = models.JSONField()

    class Meta:
        db_table = "billing_plan_entitlements"
        constraints = [
            models.UniqueConstraint(fields=["plan", "entitlement_key"], name="bill_ent_plan_key_uniq"),
        ]


class Subscription(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.PROTECT, related_name="subscriptions")
    plan = models.ForeignKey(BillingPlan, on_delete=models.PROTECT, related_name="subscriptions")
    plan_price = models.ForeignKey(BillingPlanPrice, on_delete=models.PROTECT, related_name="subscriptions")
    billing_interval = models.CharField(max_length=16, choices=BillingInterval.choices)
    currency = models.CharField(max_length=3, default="INR")
    status = models.CharField(max_length=32, choices=SubscriptionStatus.choices)
    provider = models.CharField(max_length=32, default="pulse")
    provider_subscription_ref = models.CharField(max_length=255, blank=True, null=True)
    trial_ends_at = models.DateTimeField(blank=True, null=True)
    current_period_start = models.DateTimeField(blank=True, null=True)
    current_period_end = models.DateTimeField(blank=True, null=True)
    cancel_at_period_end = models.BooleanField(default=False)
    canceled_at = models.DateTimeField(blank=True, null=True)
    past_due_since = models.DateTimeField(blank=True, null=True)
    grace_ends_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "subscriptions"
        constraints = [
            models.UniqueConstraint(
                fields=["company"],
                condition=~models.Q(status=SubscriptionStatus.CANCELED),
                name="sub_one_open_company",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in SubscriptionStatus]),
                name="sub_status_ok",
            ),
        ]


class SubscriptionItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.PROTECT, related_name="subscription_items")
    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name="items")
    item_type = models.CharField(max_length=32)
    plan_price = models.ForeignKey(BillingPlanPrice, null=True, blank=True, on_delete=models.PROTECT, related_name="items")
    description = models.CharField(max_length=255)
    billing_interval = models.CharField(max_length=16)
    currency = models.CharField(max_length=3)
    unit_amount_minor = models.BigIntegerField()
    quantity = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=32, choices=SubscriptionItemStatus.choices)
    effective_at = models.DateTimeField(blank=True, null=True)
    ended_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "subscription_items"
        constraints = [
            models.CheckConstraint(condition=models.Q(unit_amount_minor__gte=0), name="sub_item_amount_pos"),
            models.CheckConstraint(condition=models.Q(quantity__gt=0), name="sub_item_qty_pos"),
        ]


class SubscriptionStatusEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.PROTECT, related_name="subscription_events")
    subscription = models.ForeignKey(Subscription, on_delete=models.PROTECT, related_name="status_events")
    from_status = models.CharField(max_length=32, blank=True, null=True)
    to_status = models.CharField(max_length=32)
    reason = models.CharField(max_length=255)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="subscription_events",
        db_column="actor_user_id",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "subscription_status_events"

    def save(self, *args, **kwargs):
        if self.pk and SubscriptionStatusEvent.objects.filter(pk=self.pk).exists():
            raise PermissionError("Subscription status events are append-only.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("Subscription status events are append-only.")
