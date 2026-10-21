from django.db import migrations


def seed(apps, schema_editor):
    BillingPlan = apps.get_model("billing", "BillingPlan")
    BillingPlanEntitlement = apps.get_model("billing", "BillingPlanEntitlement")
    plan = BillingPlan.objects.filter(code="growth").first()
    if plan is None:
        return
    BillingPlanEntitlement.objects.update_or_create(
        plan=plan,
        entitlement_key="included_module_slugs",
        defaults={"entitlement_value": ["hrms"]},
    )


def unseed(apps, schema_editor):
    BillingPlanEntitlement = apps.get_model("billing", "BillingPlanEntitlement")
    BillingPlanEntitlement.objects.filter(entitlement_key="included_module_slugs").delete()


class Migration(migrations.Migration):
    dependencies = [("billing", "0002_seed_growth_plan")]
    operations = [migrations.RunPython(seed, unseed)]
