
import logging
from dataclasses import dataclass
from importlib.metadata import entry_points

from .exceptions import PluginError
from .registry import PluginRegistry
from .validators import validate_plugin


logger = logging.getLogger(__name__)

PLUGIN_ENTRY_POINT_GROUP = "pulse.plugins"


@dataclass(frozen=True, slots=True)
class PluginDiscoveryError:
    entry_point: str
    message: str


@dataclass(frozen=True, slots=True)
class PluginDiscoveryResult:
    registry: PluginRegistry
    errors: tuple[PluginDiscoveryError, ...]

    @property
    def discovered_count(self) -> int:
        return len(self.registry)


def discover_plugins() -> PluginDiscoveryResult:
    """
    Discover and register installed Pulse plugins.

    Each plugin is validated and staged independently.
    Invalid plugins do not prevent valid plugins from loading.
    """

    registry = PluginRegistry()
    errors: list[PluginDiscoveryError] = []

    discovered_entry_points = sorted(
        entry_points(group=PLUGIN_ENTRY_POINT_GROUP),
        key=lambda item: (item.name, item.value),
    )

    for entry_point in discovered_entry_points:
        try:
            # Load the plugin object.
            plugin = entry_point.load()

            # Validate its contract and manifest.
            manifest = validate_plugin(
                plugin=plugin,
                entry_point_name=entry_point.name,
            )

            # Stage registration in an isolated registry.
            staging_registry = PluginRegistry()

            plugin.register(staging_registry)

            staged_plugins = staging_registry.get_all_plugins()

            # Ensure the plugin registered exactly its own manifest.
            if len(staged_plugins) != 1 or staged_plugins[0] != manifest:
                raise PluginError(
                    f"Plugin '{manifest.key}' must register exactly "
                    "its own manifest."
                )

            # Commit to the main registry only after validation.
            registry.register_plugin(manifest)

            logger.info(
                "Successfully discovered Pulse plugin: %s v%s",
                manifest.key,
                manifest.version,
            )

        except Exception as exc:
            logger.exception(
                "Failed to discover Pulse plugin '%s'.",
                entry_point.name,
            )

            errors.append(
                PluginDiscoveryError(
                    entry_point=entry_point.name,
                    message=str(exc),
                )
            )

    return PluginDiscoveryResult(
        registry=registry,
        errors=tuple(errors),
    )
