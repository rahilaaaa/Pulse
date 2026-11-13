
from django.core.exceptions import ImproperlyConfigured

from .discovery import discover_plugins


def load_plugin_configuration() -> tuple[list[str], object, tuple]:
    """
    Discover plugins and prepare their Django application configs.

    Returns:
        app_configs: Django AppConfig paths.
        registry: Registered plugin manifests.
        errors: Plugin discovery errors.
    """

    result = discover_plugins()

    manifests = result.registry.get_all_plugins()

    app_configs = [
        manifest.django_app_config
        for manifest in manifests
    ]

    # Prevent duplicate Django application configurations.
    if len(app_configs) != len(set(app_configs)):
        raise ImproperlyConfigured(
            "Multiple Pulse plugins declare the same Django app config."
        )

    return (
        app_configs,
        result.registry,
        result.errors,
    )
