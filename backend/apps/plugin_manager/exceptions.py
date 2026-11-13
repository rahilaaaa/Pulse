class PluginError(Exception):
    """Base exception for Pulse plugin errors."""


class InvalidPluginError(PluginError):
    """Raised when a plugin does not follow the SDK contract."""


class IncompatiblePluginError(PluginError):
    """Raised when a plugin requires an unsupported SDK API version."""


class DuplicatePluginError(PluginError):
    """Raised when a plugin identifier is already registered."""