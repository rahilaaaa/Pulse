from django.apps import AppConfig


class PluginManagerConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.plugin_manager"
    verbose_name = "Plugin Manager"