from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from pulse_plugin_sdk import PluginManifest

from apps.plugin_manager.discovery import discover_plugins
from apps.plugin_manager.exceptions import DuplicatePluginError
from apps.plugin_manager.registry import PluginRegistry


class FakePlugin:

    def __init__(self, manifest):
        self.manifest = manifest

    def register(self, registry):
        registry.register_plugin(self.manifest)


def create_manifest(
    key="hrms",
    api_version="1.0",
    url_prefix="hrms",
):
    return PluginManifest(
        key=key,
        name="HRMS",
        version="1.0.0",
        description="Human Resource Management System",
        api_version=api_version,
        django_app_config="pulse_plugin_hrms.apps.HRMSConfig",
        url_prefix=url_prefix,
        url_module="pulse_plugin_hrms.urls",
    )


def create_entry_point(name, plugin):
    return SimpleNamespace(
        name=name,
        value=f"{name}.plugin:plugin",
        load=lambda: plugin,
    )


class PluginRegistryTests(TestCase):

    def test_register_plugin(self):
        registry = PluginRegistry()
        manifest = create_manifest()

        registry.register_plugin(manifest)

        self.assertTrue(registry.is_registered("hrms"))
        self.assertEqual(len(registry), 1)

    def test_reject_duplicate_plugin(self):
        registry = PluginRegistry()
        manifest = create_manifest()

        registry.register_plugin(manifest)

        with self.assertRaises(DuplicatePluginError):
            registry.register_plugin(manifest)

    def test_reject_duplicate_url_prefix(self):
        registry = PluginRegistry()

        registry.register_plugin(create_manifest())

        second_manifest = create_manifest(
            key="another_plugin",
            url_prefix="hrms",
        )

        with self.assertRaises(DuplicatePluginError):
            registry.register_plugin(second_manifest)


class PluginDiscoveryTests(TestCase):

    @patch("apps.plugin_manager.discovery.entry_points")
    def test_discover_valid_plugin(self, mock_entry_points):
        manifest = create_manifest()
        plugin = FakePlugin(manifest)

        mock_entry_points.return_value = [
            create_entry_point("hrms", plugin)
        ]

        result = discover_plugins()

        self.assertEqual(result.discovered_count, 1)
        self.assertEqual(len(result.errors), 0)
        self.assertTrue(result.registry.is_registered("hrms"))

    @patch("apps.plugin_manager.discovery.entry_points")
    def test_reject_incompatible_plugin(self, mock_entry_points):
        manifest = create_manifest(api_version="99.0")
        plugin = FakePlugin(manifest)

        mock_entry_points.return_value = [
            create_entry_point("hrms", plugin)
        ]

        result = discover_plugins()

        self.assertEqual(result.discovered_count, 0)
        self.assertEqual(len(result.errors), 1)

    @patch("apps.plugin_manager.discovery.entry_points")
    def test_reject_invalid_plugin(self, mock_entry_points):
        mock_entry_points.return_value = [
            create_entry_point("hrms", object())
        ]

        result = discover_plugins()

        self.assertEqual(result.discovered_count, 0)
        self.assertEqual(len(result.errors), 1)

    @patch("apps.plugin_manager.discovery.entry_points")
    def test_reject_duplicate_plugin_during_discovery(
        self,
        mock_entry_points,
    ):
        manifest = create_manifest()

        mock_entry_points.return_value = [
            create_entry_point("hrms", FakePlugin(manifest)),
            create_entry_point("hrms", FakePlugin(manifest)),
        ]

        result = discover_plugins()

        self.assertEqual(result.discovered_count, 1)
        self.assertEqual(len(result.errors), 1)

    @patch("apps.plugin_manager.discovery.entry_points")
    def test_discovery_with_no_plugins(self, mock_entry_points):
        mock_entry_points.return_value = []

        result = discover_plugins()

        self.assertEqual(result.discovered_count, 0)
        self.assertEqual(len(result.errors), 0)