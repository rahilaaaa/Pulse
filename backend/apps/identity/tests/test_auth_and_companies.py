import json

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authorization.models import Permission, PlatformPermissionGrant
from apps.identity.models import User
from apps.tenants.models import Company, CompanyMembership, CompanyStatus, MembershipStatus

PASSWORD = "a-long-passphrase"


def sign_in(client, email, password):
    """Sign in with email and password."""
    return client.post("/api/v1/auth/login/", {"email": email, "password": password}, format="json")


class AuthApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="operator@example.com",
            password=PASSWORD,
            first_name="Asha",
            last_name="Menon",
        )
        permission = Permission.objects.get(code="platform.companies.view")
        PlatformPermissionGrant.objects.create(user=self.user, permission=permission)

    def test_valid_login_returns_the_current_user_and_rotates_the_session(self):
        self.client.get("/api/v1/auth/csrf/")
        self.client.session.save()
        before = self.client.session.session_key
        response = self.client.post(
            "/api/v1/auth/login/",
            {"email": "Operator@Example.com", "password": PASSWORD},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["email"], "operator@example.com")
        self.assertEqual(response.data["platform_permissions"], ["platform.companies.view"])
        self.assertIn("sessionid", response.cookies)
        self.assertTrue(response.cookies["sessionid"]["httponly"])
        self.assertNotIn("password", response.data)
        self.assertNotEqual(self.client.session.session_key, before)
        me = self.client.get("/api/v1/auth/me/")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data["id"], str(self.user.id))
        self.assertTrue(me["X-Request-Id"])

    def test_invalid_credentials_are_rejected_without_revealing_which_field_failed(self):
        unknown = self.client.post(
            "/api/v1/auth/login/",
            {"email": "missing@example.com", "password": PASSWORD},
            format="json",
        )
        wrong = self.client.post(
            "/api/v1/auth/login/",
            {"email": "operator@example.com", "password": "not-the-password"},
            format="json",
        )
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        inactive = self.client.post(
            "/api/v1/auth/login/",
            {"email": "operator@example.com", "password": PASSWORD},
            format="json",
        )
        self.assertEqual(unknown.status_code, 401)
        self.assertEqual(wrong.status_code, 401)
        self.assertEqual(inactive.status_code, 401)
        self.assertEqual(unknown.data["error"]["message"], wrong.data["error"]["message"])
        self.assertEqual(wrong.data["error"]["message"], inactive.data["error"]["message"])
        self.assertEqual(unknown.data["error"]["code"], "not_authenticated")

    def test_logout_invalidates_the_session(self):
        sign_in(self.client, self.user.email, PASSWORD)
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 200)
        logged_out = self.client.post("/api/v1/auth/logout/")
        self.assertEqual(logged_out.status_code, 204)
        follow_up = self.client.get("/api/v1/auth/me/")
        self.assertEqual(follow_up.status_code, 401, follow_up.content)

    def test_deactivating_the_account_ends_the_existing_session(self):
        sign_in(self.client, self.user.email, PASSWORD)
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        denied = self.client.get("/api/v1/auth/me/")
        self.assertEqual(denied.status_code, 401, denied.content)
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 401)

    def test_login_is_throttled(self):
        for _ in range(5):
            response = self.client.post(
                "/api/v1/auth/login/",
                {"email": "operator@example.com", "password": "wrong-password"},
                format="json",
            )
            self.assertEqual(response.status_code, 401)
        blocked = self.client.post(
            "/api/v1/auth/login/",
            {"email": "operator@example.com", "password": PASSWORD},
            format="json",
        )
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.data["error"]["code"], "rate_limited")

    def test_csrf_is_required_for_session_login(self):
        client = APIClient(enforce_csrf_checks=True)
        missing = client.post(
            "/api/v1/auth/login/",
            {"email": self.user.email, "password": PASSWORD},
            format="json",
        )
        self.assertEqual(missing.status_code, 403)
        self.assertEqual(json.loads(missing.content)["error"]["code"], "permission_denied")

        issued = client.get("/api/v1/auth/csrf/")
        token = issued.data["csrf_token"]
        self.assertTrue(token)
        accepted = client.post(
            "/api/v1/auth/login/",
            {"email": self.user.email, "password": PASSWORD},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(accepted.status_code, 200)
        rotated = client.cookies["csrftoken"].value
        unsafe = client.post("/api/v1/auth/logout/")
        self.assertEqual(unsafe.status_code, 403)
        logged_out = client.post("/api/v1/auth/logout/", HTTP_X_CSRFTOKEN=rotated)
        self.assertEqual(logged_out.status_code, 204)


class CompanyListApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.operator = User.objects.create_user(email="operator@example.com", password=PASSWORD)
        view_permission = Permission.objects.get(code="platform.companies.view")
        audit_permission = Permission.objects.get(code="platform.audit.view")
        PlatformPermissionGrant.objects.create(user=self.operator, permission=view_permission)
        self.audit_only = User.objects.create_user(email="audit@example.com", password=PASSWORD)
        PlatformPermissionGrant.objects.create(user=self.audit_only, permission=audit_permission)
        self.member = User.objects.create_user(email="owner@example.com", password=PASSWORD)
        self.northwind = Company.objects.create(
            slug="northwind",
            legal_name="Northwind Pvt Ltd",
            display_name="Northwind",
            status=CompanyStatus.ACTIVE,
        )
        self.draft = Company.objects.create(
            slug="draft-co",
            legal_name="Draft Company",
            display_name="Draft Co",
            status=CompanyStatus.DRAFT,
        )
        CompanyMembership.objects.create(company=self.northwind, user=self.member, status=MembershipStatus.ACTIVE)
        CompanyMembership.objects.create(company=self.northwind, user=self.operator, status=MembershipStatus.REMOVED)
        sign_in(self.client, self.operator.email, PASSWORD)

    def test_unauthenticated_requests_are_rejected(self):
        response = APIClient().get("/api/v1/platform/companies/")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["error"]["code"], "not_authenticated")

    def test_company_membership_does_not_grant_platform_access(self):
        client = APIClient()
        client.post("/api/v1/auth/login/", {"email": self.member.email, "password": PASSWORD}, format="json")
        response = client.get("/api/v1/platform/companies/")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"]["code"], "permission_denied")

    def test_a_different_platform_permission_cannot_list_companies(self):
        client = APIClient()
        sign_in(client, self.audit_only.email, PASSWORD)
        response = client.get("/api/v1/platform/companies/")
        self.assertEqual(response.status_code, 403)

    def test_search_status_and_membership_count(self):
        response = self.client.get("/api/v1/platform/companies/", {"q": "North"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["slug"], "northwind")
        self.assertEqual(response.data["results"][0]["membership_count"], 1)
        self.assertNotIn("password", response.data["results"][0])

        by_slug = self.client.get("/api/v1/platform/companies/", {"q": "draft-co"})
        self.assertEqual(by_slug.data["results"][0]["status"], "draft")

        active = self.client.get("/api/v1/platform/companies/", {"status": "active"})
        self.assertEqual([row["slug"] for row in active.data["results"]], ["northwind"])

    def test_pagination_is_bounded_and_stable(self):
        for index in range(30):
            Company.objects.create(
                slug=f"co-{index:02d}",
                legal_name=f"Company {index}",
                display_name=f"Company {index:02d}",
                status=CompanyStatus.ACTIVE,
            )
        first = self.client.get("/api/v1/platform/companies/", {"page": 1, "page_size": 10, "sort": "slug"})
        second = self.client.get("/api/v1/platform/companies/", {"page": 2, "page_size": 10, "sort": "slug"})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(len(first.data["results"]), 10)
        self.assertEqual(first.data["count"], 32)
        first_ids = [row["id"] for row in first.data["results"]]
        second_ids = [row["id"] for row in second.data["results"]]
        self.assertEqual(len(set(first_ids).intersection(second_ids)), 0)
        slugs = [row["slug"] for row in first.data["results"]]
        self.assertEqual(slugs, sorted(slugs))
        too_large = self.client.get("/api/v1/platform/companies/", {"page_size": 101})
        self.assertEqual(too_large.status_code, 400)
        self.assertEqual(too_large.data["error"]["code"], "validation_error")

    def test_empty_results_and_invalid_query_parameters(self):
        empty = self.client.get("/api/v1/platform/companies/", {"q": "does-not-exist"})
        self.assertEqual(empty.status_code, 200)
        self.assertEqual(empty.data["results"], [])
        self.assertEqual(empty.data["count"], 0)
        beyond = self.client.get("/api/v1/platform/companies/", {"page": 50, "page_size": 25})
        self.assertEqual(beyond.status_code, 200)
        self.assertEqual(beyond.data["results"], [])
        invalid = self.client.get("/api/v1/platform/companies/", {"status": "archived", "sort": "revenue", "page": "zero"})
        self.assertEqual(invalid.status_code, 400)
        fields = {detail["field"] for detail in invalid.data["error"]["details"]}
        self.assertIn("status", fields)
        self.assertIn("sort", fields)
        self.assertIn("page", fields)


class PlatformDirectoryTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.operator = User.objects.create_user(email="operator@example.com", password=PASSWORD, first_name="Asha")
        for code in ("platform.companies.view", "platform.users.view", "platform.billing.view"):
            PlatformPermissionGrant.objects.create(user=self.operator, permission=Permission.objects.get(code=code))
        Company.objects.create(slug="northwind", legal_name="Northwind Pvt Ltd", display_name="Northwind", status=CompanyStatus.ACTIVE)
        sign_in(self.client, self.operator.email, PASSWORD)

    def test_overview_counts_come_from_the_database(self):
        response = self.client.get("/api/v1/platform/overview/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["companies"]["total"], 1)
        self.assertEqual(response.data["companies"]["by_status"]["active"], 1)
        self.assertEqual(response.data["users"]["total"], 1)
        self.assertEqual(response.data["users"]["in_companies"], 0)
        self.assertEqual(response.data["platform_grants"], 1)

    def test_company_detail_lists_members_for_that_company_only(self):
        company = Company.objects.get(slug="northwind")
        member = User.objects.create_user(email="member@example.com", password=PASSWORD, first_name="Sam")
        CompanyMembership.objects.create(
            company=company,
            user=member,
            status=MembershipStatus.ACTIVE,
            joined_at=timezone.now(),
        )
        response = self.client.get(f"/api/v1/platform/companies/{company.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["slug"], "northwind")
        self.assertEqual(len(response.data["members"]), 1)
        self.assertEqual(response.data["members"][0]["email"], "member@example.com")
        self.assertNotIn("password", response.data["members"][0])

    def test_sections_without_tables_return_an_empty_page(self):
        response = self.client.get("/api/v1/platform/billing/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])
        self.assertEqual(response.data["count"], 0)

    def test_company_dashboard_returns_counts_and_modules(self):
        from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus, ModuleDefinition
        from apps.organization.models import Person, PersonStatus

        company = Company.objects.get(slug="northwind")
        member = User.objects.create_user(email="dash-member@example.com", password=PASSWORD, first_name="Sam")
        CompanyMembership.objects.create(
            company=company,
            user=member,
            status=MembershipStatus.ACTIVE,
            joined_at=timezone.now(),
        )
        Person.objects.create(
            company=company,
            first_name="Sam",
            last_name="Member",
            status=PersonStatus.ACTIVE,
        )
        module = ModuleDefinition.objects.filter(is_public=True).first()
        self.assertIsNotNone(module)
        CompanyModuleInstallation.objects.create(
            company=company,
            module=module,
            status=InstallationStatus.INSTALLED,
            installed_version=module.version,
            installed_at=timezone.now(),
        )

        response = self.client.get(f"/api/v1/platform/companies/{company.id}/dashboard/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["company"]["slug"], "northwind")
        self.assertEqual(response.data["people"]["memberships_active"], 1)
        self.assertEqual(response.data["people"]["people_active"], 1)
        self.assertEqual(response.data["installed_modules_count"], 1)
        self.assertEqual(len(response.data["modules"]), 1)
        self.assertEqual(response.data["modules"][0]["slug"], module.slug)
        self.assertEqual(response.data["modules"][0]["status"], InstallationStatus.INSTALLED)
        self.assertIn("subscription", response.data)
        self.assertIn("organization", response.data)
        self.assertNotIn("activity", response.data)

    def test_company_dashboard_requires_platform_grant(self):
        company = Company.objects.get(slug="northwind")
        outsider = User.objects.create_user(email="outsider@example.com", password=PASSWORD, first_name="Out")
        client = APIClient()
        sign_in(client, outsider.email, PASSWORD)
        response = client.get(f"/api/v1/platform/companies/{company.id}/dashboard/")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"]["code"], "permission_denied")

    def test_company_dashboard_unknown_company_returns_404(self):
        response = self.client.get("/api/v1/platform/companies/00000000-0000-0000-0000-000000000099/dashboard/")
        self.assertEqual(response.status_code, 404)
