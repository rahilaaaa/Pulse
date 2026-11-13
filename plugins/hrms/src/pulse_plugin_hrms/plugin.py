from pulse_plugin_sdk import PluginManifest


class HRMSPlugin:
    manifest = PluginManifest(
        key="hrms",
        name="HRMS",
        version="1.0.0",
        description="Human Resource Management System",
        api_version="1.0",
        django_app_config="pulse_plugin_hrms.apps.HRMSConfig",
        url_prefix="hrms",
        url_module="pulse_plugin_hrms.urls",
    )

    def register(self, registry):
        registry.register_plugin(self.manifest)


plugin = HRMSPlugin()