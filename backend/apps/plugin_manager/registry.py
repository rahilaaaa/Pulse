from pulse_plugin_sdk import PluginManifest

from .exceptions import DuplicatePluginError


class PluginRegistry:
    """
    In-memory registry of plugins available in this Pulse deployment.

    This registry represents platform-level availability,
    not company-level installation.
    """

    def __init__(self) -> None:
        self._plugins: dict[str, PluginManifest] = {}

    def register_plugin(self, manifest: PluginManifest) -> None:
        if manifest.key in self._plugins:
            raise DuplicatePluginError(
                f"Plugin '{manifest.key}' is already registered."
            )

        duplicate_prefix = next(
            (
                key
                for key, registered in self._plugins.items()
                if registered.url_prefix == manifest.url_prefix
            ),
            None,
        )

        if duplicate_prefix is not None:
            raise DuplicatePluginError(
                f"URL prefix '{manifest.url_prefix}' is already "
                f"used by plugin '{duplicate_prefix}'."
            )

        self._plugins[manifest.key] = manifest

    def get_plugin(self, key: str) -> PluginManifest | None:
        return self._plugins.get(key)

    def get_all_plugins(self) -> tuple[PluginManifest, ...]:
        return tuple(self._plugins.values())

    def is_registered(self, key: str) -> bool:
        return key in self._plugins

    def __len__(self) -> int:
        return len(self._plugins)