
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.companies.models import Company
from apps.memberships.models import CompanyMembership
from apps.company_modules.models import CompanyModule


class CompanyModuleAPITests(TestCase):

    def setUp(self):
        self.client = APIClient()

        self.owner = User.objects.create_user(
            email="owner@example.com",
            password="TestPassword123!",
        )

        self.member = User.objects.create_user(
            email="member@example.com",
            password="TestPassword123!",
        )

        self.company = Company.objects.create(
            name="Test Company",
            industry="Technology",
            business_email="company@example.com",
            phone="+911234567890",
            address_line_1="Test Street",
            city="Kannur",
            state="Kerala",
            postal_code="670001",
            country="India",
            status=Company.Status.ACTIVE,
        )

        CompanyMembership.objects.create(
            user=self.owner,
            company=self.company,
            role=CompanyMembership.Role.OWNER,
            status=CompanyMembership.Status.ACTIVE,
        )

        CompanyMembership.objects.create(
            user=self.member,
            company=self.company,
            role=CompanyMembership.Role.MEMBER,
            status=CompanyMembership.Status.ACTIVE,
        )

    def authenticate_as(self, user):
        self.client.force_authenticate(
            user=user,
            token={"company_id": self.company.id},
        )

    def test_available_modules_requires_authentication(self):
        response = self.client.get(
            "/api/company-modules/available/"
        )

        self.assertEqual(response.status_code, 401)

    def test_authenticated_user_can_view_available_modules(self):
        self.authenticate_as(self.member)

        response = self.client.get(
            "/api/company-modules/available/"
        )

        self.assertEqual(response.status_code, 200)

        module_keys = {
            module["key"] for module in response.data
        }

        self.assertIn("hrms", module_keys)
        self.assertIn("project_management", module_keys)

    def test_owner_can_install_module(self):
        self.authenticate_as(self.owner)

        response = self.client.post(
            "/api/company-modules/install/",
            {"module_key": "hrms"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["module_key"], "hrms")
        self.assertEqual(
            response.data["status"],
            CompanyModule.Status.INSTALLED,
        )

    def test_member_cannot_install_module(self):
        self.authenticate_as(self.member)

        response = self.client.post(
            "/api/company-modules/install/",
            {"module_key": "hrms"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)

        self.assertFalse(
            CompanyModule.objects.filter(
                company=self.company,
                module_key="hrms",
            ).exists()
        )

    def test_owner_can_uninstall_module(self):
        CompanyModule.objects.create(
            company=self.company,
            module_key="hrms",
            status=CompanyModule.Status.INSTALLED,
            installed_by=self.owner,
        )

        self.authenticate_as(self.owner)

        response = self.client.post(
            "/api/company-modules/uninstall/",
            {"module_key": "hrms"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["status"],
            CompanyModule.Status.UNINSTALLED,
        )

    def test_uninstalled_module_is_not_in_installed_list(self):
        CompanyModule.objects.create(
            company=self.company,
            module_key="hrms",
            status=CompanyModule.Status.UNINSTALLED,
            installed_by=self.owner,
        )

        self.authenticate_as(self.owner)

        response = self.client.get("/api/company-modules/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)

    def test_user_cannot_access_another_company_context(self):
        another_company = Company.objects.create(
            name="Another Company",
            industry="Retail",
            business_email="another@example.com",
            phone="+911234567891",
            address_line_1="Another Street",
            city="Kochi",
            state="Kerala",
            postal_code="682001",
            country="India",
            status=Company.Status.ACTIVE,
        )

        self.client.force_authenticate(
            user=self.owner,
            token={"company_id": another_company.id},
        )

        response = self.client.get("/api/company-modules/")

        self.assertEqual(response.status_code, 403)
