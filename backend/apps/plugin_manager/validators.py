from pulse_plugin_sdk import (
    PLUGIN_API_VERSION,
    PluginManifest,
    PulsePlugin,
)

from .exceptions import (
    IncompatiblePluginError,
    InvalidPluginError,
)


def validate_plugin(plugin, entry_point_name: str) -> PluginManifest:
    """
    Validate a loaded plugin object and return its manifest.
    """

    if not isinstance(plugin, PulsePlugin):
        raise InvalidPluginError(
            f"Entry point '{entry_point_name}' does not implement "
            "the PulsePlugin contract."
        )

    manifest = plugin.manifest

    if not isinstance(manifest, PluginManifest):
        raise InvalidPluginError(
            f"Plugin '{entry_point_name}' has an invalid manifest."
        )

    if manifest.key != entry_point_name:
        raise InvalidPluginError(
            f"Entry point name '{entry_point_name}' does not match "
            f"manifest key '{manifest.key}'."
        )

    if manifest.api_version != PLUGIN_API_VERSION:
        raise IncompatiblePluginError(
            f"Plugin '{manifest.key}' requires SDK API "
            f"{manifest.api_version}, but Pulse supports "
            f"{PLUGIN_API_VERSION}."
        )

    return manifest