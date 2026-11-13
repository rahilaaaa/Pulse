
from rest_framework import serializers


class InstallCompanyModuleSerializer(serializers.Serializer):
    module_key = serializers.SlugField(
        max_length=100,
        required=True,
    )


class UninstallCompanyModuleSerializer(serializers.Serializer):
    module_key = serializers.SlugField(
        max_length=100,
        required=True,
    )


class CompanyModuleSerializer(serializers.Serializer):
    module_key = serializers.CharField()
    status = serializers.CharField()
    installed_at = serializers.DateTimeField()
    uninstalled_at = serializers.DateTimeField(allow_null=True)


class AvailableModuleSerializer(serializers.Serializer):
    key = serializers.CharField()
    name = serializers.CharField()
    version = serializers.CharField()
    description = serializers.CharField()
