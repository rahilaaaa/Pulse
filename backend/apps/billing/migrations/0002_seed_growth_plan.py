from datetime import datetime, timezone

from django.db import migrations

EFFECTIVE_FROM = datetime(2026, 10, 17, tzinfo=timezone.utc)


def seed_growth(apps, schema_editor):
    BillingPlan = apps.get_model("billing", "BillingPlan")
    BillingPlanPrice = apps.get_model("billing", "BillingPlanPrice")
    BillingPlanEntitlement = apps.get_model("billing", "BillingPlanEntitlement")
    plan, _created = BillingPlan.objects.get_or_create(
        code="growth",
        defaults={
            "name": "Growth",
            "description": "Company plan with a 14-day trial. Payment is not collected when the trial starts.",
            "is_active": True,
            "is_public": True,
            "trial_days": 14,
        },
    )
    for interval, amount in (("month", 249900), ("year", 2499900)):
        BillingPlanPrice.objects.get_or_create(
            plan=plan,
            billing_interval=interval,
            currency="INR",
            effective_from=EFFECTIVE_FROM,
            defaults={"amount_minor": amount, "is_active": True},
        )
    for key, value in (("max_people", 50), ("dashboards_enabled", True)):
        BillingPlanEntitlement.objects.get_or_create(
            plan=plan,
            entitlement_key=key,
            defaults={"entitlement_value": value},
        )


def unseed_growth(apps, schema_editor):
    BillingPlan = apps.get_model("billing", "BillingPlan")
    BillingPlan.objects.filter(code="growth").delete()


class Migration(migrations.Migration):
    dependencies = [("billing", "0001_initial")]

    operations = [migrations.RunPython(seed_growth, unseed_growth)]
