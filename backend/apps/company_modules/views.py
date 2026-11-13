
from django.core.exceptions import (
    PermissionDenied as DjangoPermissionDenied,
    ValidationError as DjangoValidationError,
)

from rest_framework import status
from rest_framework.exceptions import (
    NotFound,
    PermissionDenied,
    ValidationError,
)
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.memberships.permissions.company_access import HasActiveCompany

from .serializers import (
    AvailableModuleSerializer,
    CompanyModuleSerializer,
    InstallCompanyModuleSerializer,
    UninstallCompanyModuleSerializer,
)
from .services import (
    ModuleNotAvailableError,
    get_available_modules,
    get_company_modules,
    install_company_module,
    uninstall_company_module,
)


class AvailableModulesView(APIView):
    """
    List all plugins available in the Pulse installation.
    Company membership is not required to view the catalog.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        modules = get_available_modules()

        serializer = AvailableModuleSerializer(
            modules,
            many=True,
        )

        return Response(serializer.data)


class CompanyModulesView(APIView):
    """
    List modules installed for the authenticated user's active company.
    """

    permission_classes = [
        IsAuthenticated,
        HasActiveCompany,
    ]

    def get(self, request):
        modules = get_company_modules(request.company)

        serializer = CompanyModuleSerializer(
            modules,
            many=True,
        )

        return Response(serializer.data)


class InstallCompanyModuleView(APIView):
    """
    Install a plugin for the authenticated user's active company.
    Only company owners and admins can perform this operation.
    """

    permission_classes = [
        IsAuthenticated,
        HasActiveCompany,
    ]

    def post(self, request):
        serializer = InstallCompanyModuleSerializer(
            data=request.data,
        )
        serializer.is_valid(raise_exception=True)

        module_key = serializer.validated_data["module_key"]

        try:
            module = install_company_module(
                company=request.company,
                user=request.user,
                module_key=module_key,
            )

        except ModuleNotAvailableError as exc:
            raise NotFound(str(exc))

        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc))

        except DjangoValidationError as exc:
            raise ValidationError(exc.messages)

        response_serializer = CompanyModuleSerializer(module)

        return Response(
            response_serializer.data,
            status=status.HTTP_200_OK,
        )


class UninstallCompanyModuleView(APIView):
    """
    Uninstall a plugin for the authenticated user's active company.
    Existing plugin data is preserved.
    """

    permission_classes = [
        IsAuthenticated,
        HasActiveCompany,
    ]

    def post(self, request):
        serializer = UninstallCompanyModuleSerializer(
            data=request.data,
        )
        serializer.is_valid(raise_exception=True)

        module_key = serializer.validated_data["module_key"]

        try:
            module = uninstall_company_module(
                company=request.company,
                user=request.user,
                module_key=module_key,
            )

        except ModuleNotAvailableError as exc:
            raise NotFound(str(exc))

        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc))

        except DjangoValidationError as exc:
            raise ValidationError(exc.messages)

        response_serializer = CompanyModuleSerializer(module)

        return Response(
            response_serializer.data,
            status=status.HTTP_200_OK,
        )
