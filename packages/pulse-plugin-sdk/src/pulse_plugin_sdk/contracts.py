
from dataclasses import dataclass
from typing import Protocol, runtime_checkable
import re

PLUGIN_API_VERSION = "1.0"

@dataclass(frozen=True, slots=True)
class PluginManifest:
    """
    Metadata describing a Pulse plugin.

    Every plugin must expose one valid manifest.
    """

    key: str
    name: str
    version: str
    description: str
    api_version: str

    # Django integration metadata
    django_app_config: str
    url_prefix: str
    url_module: str

    def __post_init__(self) -> None:
        if not re.fullmatch(r"[a-z][a-z0-9_]*", self.key):
            raise ValueError(
                "Plugin key must contain lowercase letters, "
                "numbers and underscores, and start with a letter."
            )

        if not self.name.strip():
            raise ValueError("Plugin name cannot be empty.")

        if not self.version.strip():
            raise ValueError("Plugin version cannot be empty.")

        if not self.description.strip():
            raise ValueError("Plugin description cannot be empty.")

        if not self.api_version.strip():
            raise ValueError("Plugin API version cannot be empty.")

        if not self.django_app_config.strip():
            raise ValueError("Django app config cannot be empty.")

        if not re.fullmatch(r"[a-z][a-z0-9_-]*", self.url_prefix):
            raise ValueError(
                "URL prefix must start with a lowercase letter "
                "and contain only lowercase letters, numbers, "
                "underscores, and hyphens."
            )

        if not self.url_module.strip():
            raise ValueError("URL module cannot be empty.")

@runtime_checkable
class PulsePlugin(Protocol):
    """
    Interface every Pulse plugin must implement.
    """

    manifest: PluginManifest

    def register(self, registry: "PluginRegistryProtocol") -> None:
        ...

@runtime_checkable
class PluginRegistryProtocol(Protocol):
    """
    Minimal interface exposed to plugin registration code.
    """

    def register_plugin(self, manifest: PluginManifest) -> None:
        ...