import uuid
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog, AuditScope
from apps.authorization.company import bootstrap_company_access
from apps.authorization.models import CompanyRole, MembershipRoleAssignment, Permission, PlatformPermissionGrant
from apps.billing.models import BillingPlan, BillingPlanPrice, Subscription, SubscriptionStatus
from apps.identity.models import User
from apps.tenants.models import Company, CompanyMembership, CompanyStatus, MembershipStatus

PASSWORD = "a-long-test-passphrase-1234"


class TenantIsolationAndAdminActivityTests(TestCase):
    """
    Comprehensive verification for:
    1. Tenant A cannot see Tenant B's activities.
    2. Tenant B cannot see Tenant A's activities.
    3. Tenant users cannot see platform admin activities or admin usernames.
    4. Tenant users cannot retrieve platform admin audit logs directly through APIs.
    5. Tenant users cannot access another tenant's records by changing request parameters or IDs.
    6. Platform admins can still access platform-level logs through the authorized admin console.
    7. Tenant users can still see legitimate activities performed by users within their own company.
    """

    def setUp(self):
        # 1. Platform Admin user with platform permissions
        self.platform_admin = User.objects.create_user(
            email="platform-superadmin@example.com",
            password=PASSWORD,
            first_name="Admin",
            last_name="Super",
        )
        self.platform_admin.email_verified_at = timezone.now()
        self.platform_admin.save(update_fields=["email_verified_at", "updated_at"])
        for code in ["platform.audit.view", "platform.companies.view", "platform.companies.manage", "platform.settings.manage"]:
            perm = Permission.objects.filter(code=code).first()
            if perm:
                PlatformPermissionGrant.objects.create(user=self.platform_admin, permission=perm)

        # 2. Setup Tenant A
        self.owner_a = User.objects.create_user(
            email="owner-a@companya.com",
            password=PASSWORD,
            first_name="Alice",
            last_name="TenantA",
        )
        self.owner_a.email_verified_at = timezone.now()
        self.owner_a.save(update_fields=["email_verified_at", "updated_at"])
        self.company_a = Company.objects.create(
            slug="tenant-a",
            legal_name="Tenant A Corp",
            display_name="Tenant A",
            status=CompanyStatus.ACTIVE,
            created_by=self.owner_a,
        )
        self.membership_a = CompanyMembership.objects.create(
            company=self.company_a,
            user=self.owner_a,
            status=MembershipStatus.ACTIVE,
            joined_at=timezone.now(),
        )
        bootstrap_company_access(self.company_a, self.owner_a)
        plan = BillingPlan.objects.get(code="growth")
        price = BillingPlanPrice.objects.filter(plan=plan, billing_interval="year", currency="INR").order_by("-effective_from").first()
        Subscription.objects.create(
            company=self.company_a,
            plan=plan,
            plan_price=price,
            billing_interval="year",
            currency="INR",
            status=SubscriptionStatus.TRIALING,
            provider="pulse",
        )

        # 3. Setup Tenant B
        self.owner_b = User.objects.create_user(
            email="owner-b@companyb.com",
            password=PASSWORD,
            first_name="Bob",
            last_name="TenantB",
        )
        self.owner_b.email_verified_at = timezone.now()
        self.owner_b.save(update_fields=["email_verified_at", "updated_at"])
        self.company_b = Company.objects.create(
            slug="tenant-b",
            legal_name="Tenant B Corp",
            display_name="Tenant B",
            status=CompanyStatus.ACTIVE,
            created_by=self.owner_b,
        )
        self.membership_b = CompanyMembership.objects.create(
            company=self.company_b,
            user=self.owner_b,
            status=MembershipStatus.ACTIVE,
            joined_at=timezone.now(),
        )
        bootstrap_company_access(self.company_b, self.owner_b)
        Subscription.objects.create(
            company=self.company_b,
            plan=plan,
            plan_price=price,
            billing_interval="year",
            currency="INR",
            status=SubscriptionStatus.TRIALING,
            provider="pulse",
        )

        # 4. Seed legitimate activities in Company A
        self.role_a = CompanyRole.objects.create(
            company=self.company_a,
            name="Security Specialist A",
            description="Role in Company A",
            is_system=False,
        )
        self.log_a1 = AuditLog.objects.create(
            company=self.company_a,
            actor=self.owner_a,
            action="role.created",
            object_type="company_role",
            object_id=self.role_a.id,
            scope=AuditScope.COMPANY,
            after={"name": "Security Specialist A"},
        )
        self.log_a2 = AuditLog.objects.create(
            company=self.company_a,
            actor=self.owner_a,
            action="company.updated",
            object_type="company",
            object_id=self.company_a.id,
            scope=AuditScope.COMPANY,
            after={"display_name": "Tenant A Updated"},
        )

        # 5. Seed legitimate activities in Company B
        self.role_b = CompanyRole.objects.create(
            company=self.company_b,
            name="DevOps Engineer B",
            description="Role in Company B",
            is_system=False,
        )
        self.log_b1 = AuditLog.objects.create(
            company=self.company_b,
            actor=self.owner_b,
            action="role.created",
            object_type="company_role",
            object_id=self.role_b.id,
            scope=AuditScope.COMPANY,
            after={"name": "DevOps Engineer B"},
        )

        # 6. Seed Platform Admin activities affecting Company A (suspension, metadata update)
        self.log_platform_suspended = AuditLog.objects.create(
            company=self.company_a,
            actor=self.platform_admin,
            action="company.suspended",
            object_type="company",
            object_id=self.company_a.id,
            scope=AuditScope.PLATFORM,
            after={"status": "suspended", "reason": "Overdue payment verification"},
        )
        self.log_platform_meta = AuditLog.objects.create(
            company=self.company_a,
            actor=self.platform_admin,
            action="company.metadata_updated",
            object_type="company",
            object_id=self.company_a.id,
            scope=AuditScope.PLATFORM,
            after={"display_name": "Tenant A (Admin reviewed)"},
        )
        self.log_platform_sub = AuditLog.objects.create(
            company=self.company_a,
            actor=self.platform_admin,
            action="platform.subscription.plan_changed",
            object_type="subscription",
            object_id=uuid.uuid4(),
            scope=AuditScope.PLATFORM,
            after={"plan_code": "enterprise"},
        )

        # 7. Seed Global Platform activity (no company)
        self.log_global_settings = AuditLog.objects.create(
            company=None,
            actor=self.platform_admin,
            action="platform.settings.updated",
            object_type="platform_settings",
            object_id=None,
            scope=AuditScope.PLATFORM,
            after={"grace_period_days": 14},
        )

    def test_1_tenant_a_cannot_see_tenant_b_activities(self):
        """Requirement 1: Tenant A cannot see Tenant B's activities."""
        client_a = APIClient()
        client_a.force_login(self.owner_a)

        response = client_a.get(f"/api/v1/companies/{self.company_a.id}/audit/")
        self.assertEqual(response.status_code, 200, response.data)

        results = response.data["results"]
        targets = [row["target"] for row in results]
        actor_names = [row["actor_name"] for row in results]

        # Verify none of Tenant B's roles or actions are in Tenant A's audit log
        self.assertFalse(any("DevOps Engineer B" in t for t in targets))
        self.assertNotIn("Bob TenantB", actor_names)
        self.assertNotIn(str(self.owner_b.id), [a["id"] for a in response.data["actors"]])

        # Check workspace overview recent activity
        session = client_a.session
        session["active_company_id"] = str(self.company_a.id)
        session.save()
        overview = client_a.get("/api/v1/workspace/overview/")
        self.assertEqual(overview.status_code, 200)
        recent = overview.data.get("activity", [])
        self.assertFalse(any("DevOps Engineer B" in str(item) for item in recent))
        self.assertFalse(any(self.owner_b.email in str(item) for item in recent))

    def test_2_tenant_b_cannot_see_tenant_a_activities(self):
        """Requirement 2: Tenant B cannot see Tenant A's activities."""
        client_b = APIClient()
        client_b.force_login(self.owner_b)

        response = client_b.get(f"/api/v1/companies/{self.company_b.id}/audit/")
        self.assertEqual(response.status_code, 200, response.data)

        results = response.data["results"]
        targets = [row["target"] for row in results]
        actor_names = [row["actor_name"] for row in results]

        # Verify none of Tenant A's roles or actions are in Tenant B's audit log
        self.assertFalse(any("Security Specialist A" in t for t in targets))
        self.assertNotIn("Alice TenantA", actor_names)
        self.assertNotIn(str(self.owner_a.id), [a["id"] for a in response.data["actors"]])

        # Check workspace overview recent activity
        session = client_b.session
        session["active_company_id"] = str(self.company_b.id)
        session.save()
        overview = client_b.get("/api/v1/workspace/overview/")
        self.assertEqual(overview.status_code, 200)
        recent = overview.data.get("activity", [])
        self.assertFalse(any("Security Specialist A" in str(item) for item in recent))
        self.assertFalse(any(self.owner_a.email in str(item) for item in recent))

    def test_3_tenant_users_cannot_see_platform_admin_activities(self):
        """Requirement 3: Platform admin activities and usernames never appear in tenant audit log or overview."""
        client_a = APIClient()
        client_a.force_login(self.owner_a)

        response = client_a.get(f"/api/v1/companies/{self.company_a.id}/audit/")
        self.assertEqual(response.status_code, 200, response.data)

        actions = [row["action"] for row in response.data["results"]]
        # Platform-level lifecycle/admin operations must be excluded
        self.assertNotIn("company.suspended", actions)
        self.assertNotIn("company.metadata_updated", actions)
        self.assertNotIn("platform.subscription.plan_changed", actions)
        self.assertNotIn("platform.settings.updated", actions)

        # Platform admin username/email must NEVER appear in actors list or log rows
        actor_names = [row["actor_name"] for row in response.data["results"]]
        self.assertNotIn("Admin Super", actor_names)
        self.assertNotIn("platform-superadmin@example.com", actor_names)

        actors_dropdown = response.data.get("actors", [])
        self.assertNotIn(str(self.platform_admin.id), [a["id"] for a in actors_dropdown])
        self.assertNotIn("Admin Super", [a["name"] for a in actors_dropdown])

        # Check workspace overview recent activity
        session = client_a.session
        session["active_company_id"] = str(self.company_a.id)
        session.save()
        overview = client_a.get("/api/v1/workspace/overview/")
        self.assertEqual(overview.status_code, 200)
        recent_activity = overview.data.get("activity", [])
        for act in recent_activity:
            self.assertNotEqual(act.get("actor_email"), self.platform_admin.email)
            self.assertNotEqual(act.get("actor_name"), "Admin Super")
            self.assertNotIn("platform.", act.get("action", ""))
            self.assertNotIn(act.get("action"), ["company.suspended", "company.metadata_updated"])

    def test_4_tenant_users_cannot_retrieve_platform_admin_audit_logs_directly(self):
        """Requirement 4: Platform audit APIs reject tenant users with 403 Forbidden."""
        client_a = APIClient()
        client_a.force_login(self.owner_a)

        # Platform audit list
        res_list = client_a.get("/api/v1/platform/audit-logs/")
        self.assertEqual(res_list.status_code, 403)

        # Platform audit detail
        res_detail = client_a.get(f"/api/v1/platform/audit-logs/{self.log_platform_suspended.id}/")
        self.assertEqual(res_detail.status_code, 403)

        # Platform company audit endpoint
        res_comp_audit = client_a.get(f"/api/v1/platform/companies/{self.company_a.id}/audit-logs/")
        self.assertEqual(res_comp_audit.status_code, 403)

    def test_5_tenant_users_cannot_access_another_tenant_records_by_changing_ids(self):
        """Requirement 5: Cross-tenant access is rejected when changing request parameters or URL IDs."""
        client_a = APIClient()
        client_a.force_login(self.owner_a)

        # User A attempts to read Company B's audit log
        res_cross = client_a.get(f"/api/v1/companies/{self.company_b.id}/audit/")
        self.assertIn(res_cross.status_code, [403, 404])

        # User A attempts to tamper with company query parameter on company A endpoint
        res_tamper = client_a.get(f"/api/v1/companies/{self.company_a.id}/audit/?company_id={self.company_b.id}")
        self.assertEqual(res_tamper.status_code, 200)
        # Verify that despite the query parameter, only Company A's data is returned
        results = res_tamper.data["results"]
        self.assertTrue(all("DevOps Engineer B" not in r["target"] for r in results))

    def test_6_platform_admins_can_access_platform_logs_through_authorized_console(self):
        """Requirement 6: Platform admins can access platform-level logs and company audits via admin console."""
        admin_client = APIClient()
        admin_client.force_login(self.platform_admin)

        # Access platform audit logs
        res_platform = admin_client.get("/api/v1/platform/audit-logs/")
        self.assertEqual(res_platform.status_code, 200, res_platform.data)
        actions = [r["action"] for r in res_platform.data["results"]]
        self.assertIn("company.suspended", actions)
        self.assertIn("platform.settings.updated", actions)

        # Filter by scope=platform
        res_scoped = admin_client.get("/api/v1/platform/audit-logs/?scope=platform")
        self.assertEqual(res_scoped.status_code, 200)
        self.assertTrue(all(r["scope"] == "platform" for r in res_scoped.data["results"]))

        # Access company-level audit trail from Platform Console
        res_company_audit = admin_client.get(f"/api/v1/platform/companies/{self.company_a.id}/audit-logs/")
        self.assertEqual(res_company_audit.status_code, 200)
        company_actions = [r["action"] for r in res_company_audit.data["results"]]
        self.assertIn("company.suspended", company_actions)
        self.assertIn("role.created", company_actions)

    def test_7_tenant_users_can_see_legitimate_activities_within_own_company(self):
        """Requirement 7: Tenant users can see legitimate activities performed by users within their company."""
        client_a = APIClient()
        client_a.force_login(self.owner_a)

        response = client_a.get(f"/api/v1/companies/{self.company_a.id}/audit/")
        self.assertEqual(response.status_code, 200)

        results = response.data["results"]
        by_action = {r["action"]: r for r in results}

        self.assertIn("role.created", by_action)
        self.assertEqual(by_action["role.created"]["actor_name"], "Alice TenantA")
        self.assertEqual(by_action["role.created"]["mechanism"], "Web app")
        self.assertEqual(by_action["role.created"]["target"], "Role · Security Specialist A")
        self.assertEqual(by_action["role.created"]["result"], "success")

        # Verify actors filter contains Alice
        actors = response.data["actors"]
        alice_entry = next((a for a in actors if a["id"] == str(self.owner_a.id)), None)
        self.assertIsNotNone(alice_entry)
        self.assertEqual(alice_entry["name"], "Alice TenantA")
