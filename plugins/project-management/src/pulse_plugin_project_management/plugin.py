from pulse_plugin_sdk import PluginManifest


class ProjectManagementPlugin:
    manifest = PluginManifest(
        key="project_management",
        name="Project Management",
        version="1.0.0",
        description="Project and task management",
        api_version="1.0",
        django_app_config=(
            "pulse_plugin_project_management.apps.ProjectManagementConfig"
        ),
        url_prefix="project-management",
        url_module="pulse_plugin_project_management.urls",
    )

    def register(self, registry):
        registry.register_plugin(self.manifest)


plugin = ProjectManagementPlugin()