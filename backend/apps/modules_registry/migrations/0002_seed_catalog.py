from django.db import migrations

from apps.modules_registry.manifests import MODULES


def seed(apps, schema_editor):
    ModuleDefinition = apps.get_model("modules_registry", "ModuleDefinition")
    for item in MODULES:
        ModuleDefinition.objects.update_or_create(
            slug=item["slug"],
            defaults={
                "display_name": item["display_name"],
                "description": item["description"],
                "version": item["version"],
                "django_app_label": item["django_app_label"],
                "min_platform_version": "0.1.0",
                "is_core": item["is_core"],
                "is_public": item["is_public"],
                "installation_available": item["installation_available"],
                "config_schema": {},
            },
        )


def unseed(apps, schema_editor):
    ModuleDefinition = apps.get_model("modules_registry", "ModuleDefinition")
    ModuleDefinition.objects.filter(slug__in=[item["slug"] for item in MODULES]).delete()


class Migration(migrations.Migration):
    dependencies = [("modules_registry", "0001_initial")]
    operations = [migrations.RunPython(seed, unseed)]
