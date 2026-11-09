from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authorization.company import bootstrap_company_access
from apps.billing.models import BillingPlan, BillingPlanPrice, Subscription, SubscriptionStatus
from apps.identity.models import User
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus, ModuleDefinition
from apps.tenants.models import Company, CompanyMembership, CompanyStatus, MembershipStatus

PASSWORD = "a-long-passphrase"


class ProjectsIsolationTests(TestCase):
    def setUp(self):
        self.owner_a, self.company_a = self._open_company("proj-a", "a@proj.test")
        self.owner_b, self.company_b = self._open_company("proj-b", "b@proj.test")
        self._install(self.company_a, self.owner_a)
        self._install(self.company_b, self.owner_b)

    def test_project_create_and_cross_company_404(self):
        created = self._client(self.owner_a).post(
            f"/api/v1/companies/{self.company_a.id}/projects/",
            {"name": "Launch", "description": "MVP"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        foreign = self._client(self.owner_b).get(
            f"/api/v1/companies/{self.company_b.id}/projects/{created.data['id']}/"
        )
        self.assertEqual(foreign.status_code, 404)
        uninstalled = self._client(self.owner_a).post(
            f"/api/v1/companies/{self.company_a.id}/modules/projects/uninstall/",
            {},
            format="json",
        )
        self.assertEqual(uninstalled.status_code, 200)
        listed = self._client(self.owner_a).get(f"/api/v1/companies/{self.company_a.id}/projects/")
        self.assertEqual(listed.status_code, 404)

    def _install(self, company, user):
        module = ModuleDefinition.objects.get(slug="projects")
        CompanyModuleInstallation.objects.create(
            company=company,
            module=module,
            status=InstallationStatus.INSTALLED,
            installed_version=module.version,
            installed_at=timezone.now(),
            installed_by=user,
        )

    def _open_company(self, slug, email):
        owner = User.objects.create_user(email=email, password=PASSWORD, first_name="Ada", last_name="Owner")
        owner.email_verified_at = timezone.now()
        owner.save(update_fields=["email_verified_at", "updated_at"])
        company = Company.objects.create(
            slug=slug, legal_name=slug, display_name=slug, status=CompanyStatus.ACTIVE, created_by=owner
        )
        CompanyMembership.objects.create(company=company, user=owner, status=MembershipStatus.ACTIVE, joined_at=timezone.now())
        bootstrap_company_access(company, owner)
        plan = BillingPlan.objects.get(code="growth")
        price = BillingPlanPrice.objects.filter(plan=plan, billing_interval="year", currency="INR").order_by("-effective_from").first()
        Subscription.objects.create(
            company=company,
            plan=plan,
            plan_price=price,
            billing_interval="year",
            currency="INR",
            status=SubscriptionStatus.TRIALING,
            provider="pulse",
        )
        return owner, company

    def _client(self, user):
        client = APIClient()
        client.force_login(user)
        return client
