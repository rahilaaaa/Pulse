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
        defaults={"entitlement_value": ["hrms", "projects", "crm", "commerce"]},
    )


def unseed(apps, schema_editor):
    BillingPlanEntitlement = apps.get_model("billing", "BillingPlanEntitlement")
    BillingPlanEntitlement.objects.filter(entitlement_key="included_module_slugs").update(
        entitlement_value=["hrms"]
    )


class Migration(migrations.Migration):
    dependencies = [("billing", "0003_growth_includes_hrms")]
    operations = [migrations.RunPython(seed, unseed)]
