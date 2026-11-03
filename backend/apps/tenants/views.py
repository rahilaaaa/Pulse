from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.tenants.services import (
    create_company,
    get_member_company,
    list_member_companies,
    onboarding_checklist,
    save_billing_profile,
    update_company_profile,
)


class OnboardingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(onboarding_checklist(request.user))


class OnboardingCompanyProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        return Response(update_company_profile(user=request.user, payload=request.data, request=request))


class OnboardingBillingProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        return Response(save_billing_profile(user=request.user, payload=request.data, request=request))


class OnboardingCompanyCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        company = create_company(user=request.user, payload=request.data, request=request)
        return Response(get_member_company(user=request.user, company_id=company.id), status=201)


class MemberCompanyListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(list_member_companies(request.user))


class MemberCompanyDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        return Response(get_member_company(user=request.user, company_id=company_id))


class OnboardingModulesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.modules_registry.services import list_onboarding_modules

        return Response(list_onboarding_modules())

    def post(self, request):
        from apps.modules_registry.services import validate_onboarding_modules

        slugs = request.data.get("modules") or request.data.get("module_slugs") or []
        validate_onboarding_modules(slugs)
        return Response({"valid": True, "selected": slugs})
