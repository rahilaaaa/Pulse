
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.companies.models import Company
from apps.memberships.models import CompanyMembership
from apps.company_modules.models import CompanyModule


class PluginAccessSecurityTests(TestCase):

    def setUp(self):
        self.client = APIClient()

        self.user = User.objects.create_user(
            email="owner@example.com",
            password="TestPassword123!",
        )

        self.company_a = self.create_company(
            "Company A",
            "company-a@example.com",
        )

        self.company_b = self.create_company(
            "Company B",
            "company-b@example.com",
        )

        # The same user belongs to both companies.
        for company in (self.company_a, self.company_b):
            CompanyMembership.objects.create(
                user=self.user,
                company=company,
                role=CompanyMembership.Role.OWNER,
                status=CompanyMembership.Status.ACTIVE,
            )

    def create_company(self, name, email):
        return Company.objects.create(
            name=name,
            industry="Technology",
            business_email=email,
            phone="+911234567890",
            address_line_1="Test Street",
            city="Kannur",
            state="Kerala",
            postal_code="670001",
            country="India",
            status=Company.Status.ACTIVE,
        )

    def authenticate_for_company(self, company):
        self.client.force_authenticate(
            user=self.user,
            token={"company_id": company.id},
        )

    def install_module(self, company, module_key):
        return CompanyModule.objects.create(
            company=company,
            module_key=module_key,
            status=CompanyModule.Status.INSTALLED,
            installed_by=self.user,
        )

    def test_unauthenticated_user_cannot_access_hrms(self):
        response = self.client.get("/api/plugins/hrms/")

        self.assertEqual(response.status_code, 401)

    def test_user_without_company_context_cannot_access_hrms(self):
        self.client.force_authenticate(
            user=self.user,
            token={},
        )

        response = self.client.get("/api/plugins/hrms/")

        self.assertEqual(response.status_code, 403)

    def test_uninstalled_hrms_returns_403(self):
        self.authenticate_for_company(self.company_a)

        response = self.client.get("/api/plugins/hrms/")

        self.assertEqual(response.status_code, 403)

    def test_installed_hrms_returns_200(self):
        self.install_module(self.company_a, "hrms")
        self.authenticate_for_company(self.company_a)

        response = self.client.get("/api/plugins/hrms/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["module"], "HRMS")
        self.assertEqual(
            response.data["company"]["id"],
            self.company_a.id,
        )

    def test_uninstalled_project_management_returns_403(self):
        self.authenticate_for_company(self.company_a)

        response = self.client.get(
            "/api/plugins/project-management/"
        )

        self.assertEqual(response.status_code, 403)

    def test_installed_project_management_returns_200(self):
        self.install_module(
            self.company_a,
            "project_management",
        )
        self.authenticate_for_company(self.company_a)

        response = self.client.get(
            "/api/plugins/project-management/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["module"],
            "Project Management",
        )

    def test_company_cannot_access_another_company_installed_module(self):
        # HRMS is installed only for Company B.
        self.install_module(self.company_b, "hrms")

        # The user selects Company A.
        self.authenticate_for_company(self.company_a)

        response = self.client.get("/api/plugins/hrms/")

        self.assertEqual(response.status_code, 403)

    def test_uninstalling_module_immediately_blocks_access(self):
        module = self.install_module(
            self.company_a,
            "hrms",
        )

        self.authenticate_for_company(self.company_a)

        # Initially accessible.
        first_response = self.client.get("/api/plugins/hrms/")
        self.assertEqual(first_response.status_code, 200)

        # Disable the module.
        module.status = CompanyModule.Status.UNINSTALLED
        module.save(update_fields=["status", "updated_at"])

        # Access should now be blocked.
        second_response = self.client.get("/api/plugins/hrms/")
        self.assertEqual(second_response.status_code, 403)
