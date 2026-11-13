
from django.test import TestCase
from django.core.exceptions import PermissionDenied

from apps.accounts.models import User
from apps.companies.models import Company
from apps.memberships.models import CompanyMembership
from apps.company_modules.models import CompanyModule
from apps.company_modules.services import (
    install_company_module,
    uninstall_company_module,
    is_module_installed,
)


class CompanyModuleServiceTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            email="owner@example.com",
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
            user=self.user,
            company=self.company,
            role=CompanyMembership.Role.OWNER,
            status=CompanyMembership.Status.ACTIVE,
        )

    def test_owner_can_install_hrms(self):
        module = install_company_module(
            company=self.company,
            user=self.user,
            module_key="hrms",
        )

        self.assertEqual(
            module.status,
            CompanyModule.Status.INSTALLED,
        )

        self.assertTrue(
            is_module_installed(self.company, "hrms")
        )

    def test_owner_can_uninstall_hrms(self):
        install_company_module(
            company=self.company,
            user=self.user,
            module_key="hrms",
        )

        module = uninstall_company_module(
            company=self.company,
            user=self.user,
            module_key="hrms",
        )

        self.assertEqual(
            module.status,
            CompanyModule.Status.UNINSTALLED,
        )

        self.assertFalse(
            is_module_installed(self.company, "hrms")
        )

    def test_reinstall_reuses_existing_record(self):
        first = install_company_module(
            company=self.company,
            user=self.user,
            module_key="hrms",
        )

        uninstall_company_module(
            company=self.company,
            user=self.user,
            module_key="hrms",
        )

        second = install_company_module(
            company=self.company,
            user=self.user,
            module_key="hrms",
        )

        self.assertEqual(first.pk, second.pk)
        self.assertEqual(
            CompanyModule.objects.filter(
                company=self.company,
                module_key="hrms",
            ).count(),
            1,
        )

    def test_member_cannot_install_module(self):
        member = User.objects.create_user(
            email="member@example.com",
            password="TestPassword123!",
        )

        CompanyMembership.objects.create(
            user=member,
            company=self.company,
            role=CompanyMembership.Role.MEMBER,
            status=CompanyMembership.Status.ACTIVE,
        )

        with self.assertRaises(PermissionDenied):
            install_company_module(
                company=self.company,
                user=member,
                module_key="hrms",
            )
