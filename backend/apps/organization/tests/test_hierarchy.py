import importlib
from datetime import timedelta

from django.apps import apps
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.authorization.company import bootstrap_company_access
from apps.authorization.models import CompanyRole, CompanyRoleNavigation, MembershipRoleAssignment
from apps.billing.models import BillingPlan, BillingPlanPrice, Subscription, SubscriptionStatus
from apps.dashboards.services import navigation_for
from apps.identity.models import User
from apps.organization.models import Department, Person
from apps.tenants.models import Company, CompanyMembership, CompanyStatus, MembershipStatus

PASSWORD = "a-long-passphrase"


class OrganizationHierarchyTests(TestCase):
    def setUp(self):
        self.owner, self.company = self._open_company("northwind", "owner@example.com")
        self.viewer, _membership = self._member(self.company, "lead@example.com", "department_manager", self.owner)
        self.employee, _employee_membership = self._member(self.company, "staff@example.com", "employee", self.owner)
        self.owner_membership = CompanyMembership.objects.get(company=self.company, user=self.owner)

    def test_permission_denial_does_not_write_or_audit(self):
        denied = self._client(self.employee).get(self._units_url())
        self.assertEqual(denied.status_code, 403)
        blocked = self._client(self.viewer).post(self._units_url(), {"name": "Finance"}, format="json")
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.data["error"]["code"], "permission_denied")
        self.assertFalse(Department.objects.filter(company=self.company, name="Finance").exists())
        self.assertFalse(AuditLog.objects.filter(action__startswith="organization_unit").exists())
        allowed = self._client(self.viewer).get(self._units_url())
        self.assertEqual(allowed.status_code, 200)

    def test_duplicate_key_and_failed_request_leave_no_audit(self):
        client = self._client(self.owner)
        created = client.post(self._units_url(), {"name": "Finance", "key": "Finance Team"}, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["key"], "finance-team")
        before = Department.objects.filter(company=self.company).count()
        duplicate = client.post(self._units_url(), {"name": "Another", "key": "finance-team"}, format="json")
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(Department.objects.filter(company=self.company).count(), before)
        self.assertEqual(AuditLog.objects.filter(action="organization_unit.created").count(), 1)

    def test_cross_company_references_are_not_found(self):
        _other_owner, other = self._open_company("other-co", "other-owner@example.com")
        foreign_type = self._client(_other_owner).post(self._types_url(other), {"key": "branch", "singular_label": "Branch"}, format="json").data
        foreign_unit = self._client(_other_owner).post(self._units_url(other), {"name": "North", "key": "north"}, format="json").data
        foreign_person = Person.objects.create(company=other, first_name="No", last_name="Access")
        client = self._client(self.owner)
        local = client.post(self._units_url(), {"name": "Home", "key": "home"}, format="json")
        self.assertEqual(local.status_code, 201, local.data)
        parent = client.patch(self._unit_url(local.data["id"]), {"parent_id": foreign_unit["id"]}, format="json")
        unit_type = client.patch(self._unit_url(local.data["id"]), {"unit_type_id": foreign_type["id"]}, format="json")
        manager = client.patch(self._unit_url(local.data["id"]), {"manager_id": str(foreign_person.id)}, format="json")
        members = client.put(self._members_url(local.data["id"]), {"person_ids": [str(foreign_person.id)]}, format="json")
        for response in (parent, unit_type, manager, members):
            self.assertEqual(response.status_code, 404, response.data)
        row = Department.objects.get(pk=local.data["id"])
        self.assertIsNone(row.parent_id)
        self.assertIsNone(row.unit_type_id)
        self.assertIsNone(row.manager_id)
        foreign_person.refresh_from_db()
        self.assertIsNone(foreign_person.department_id)
        self.assertFalse(AuditLog.objects.filter(action="organization_unit.updated").exists())
        self.assertFalse(AuditLog.objects.filter(action="organization_unit.members_changed").exists())

    def test_self_parent_descendant_cycle_and_parent_type_rules(self):
        client = self._client(self.owner)
        division = client.post(self._types_url(), {"key": "division", "singular_label": "Division", "allowed_parent_keys": []}, format="json")
        team = client.post(self._types_url(), {"key": "team", "singular_label": "Team", "allowed_parent_keys": ["division"]}, format="json")
        self.assertEqual(division.status_code, 201, division.data)
        self.assertEqual(team.status_code, 201, team.data)
        root = client.post(self._units_url(), {"name": "Company", "unit_type_id": division.data["id"]}, format="json")
        child = client.post(self._units_url(), {"name": "Delivery", "parent_id": root.data["id"], "unit_type_id": team.data["id"]}, format="json")
        grandchild = client.post(self._units_url(), {"name": "Platform", "parent_id": child.data["id"], "unit_type_id": team.data["id"]}, format="json")
        self.assertEqual(grandchild.status_code, 409)
        open_team = client.post(self._types_url(), {"key": "squad", "singular_label": "Squad", "allowed_parent_keys": []}, format="json")
        nested = client.post(self._units_url(), {"name": "Platform", "parent_id": child.data["id"], "unit_type_id": open_team.data["id"]}, format="json")
        self.assertEqual(nested.status_code, 201, nested.data)
        root_team = client.post(self._units_url(), {"name": "Floating", "unit_type_id": team.data["id"]}, format="json")
        self.assertEqual(root_team.status_code, 201, root_team.data)
        self_parent = client.patch(self._unit_url(root.data["id"]), {"parent_id": root.data["id"]}, format="json")
        cycle = client.patch(self._unit_url(root.data["id"]), {"parent_id": child.data["id"]}, format="json")
        self.assertEqual(self_parent.status_code, 409)
        self.assertEqual(cycle.status_code, 409)
        Department.objects.get(pk=root.data["id"]).refresh_from_db()
        self.assertIsNone(Department.objects.get(pk=root.data["id"]).parent_id)
        self.assertFalse(AuditLog.objects.filter(action="organization_unit.updated").exists())

    def test_deactivation_preserves_children_and_people_and_audits_once(self):
        client = self._client(self.owner)
        parent = client.post(self._units_url(), {"name": "Operations"}, format="json")
        child = client.post(self._units_url(), {"name": "Support", "parent_id": parent.data["id"]}, format="json")
        person = Person.objects.create(company=self.company, first_name="Pat", last_name="Lee", department_id=child.data["id"])
        users_before = User.objects.count()
        assigned = client.put(self._members_url(parent.data["id"]), {"person_ids": [str(person.id)]}, format="json")
        self.assertEqual(assigned.status_code, 200, assigned.data)
        self.assertEqual(User.objects.count(), users_before)
        person.refresh_from_db()
        self.assertEqual(str(person.department_id), parent.data["id"])
        again = client.put(self._members_url(parent.data["id"]), {"person_ids": [str(person.id)]}, format="json")
        self.assertEqual(again.status_code, 200)
        self.assertEqual(AuditLog.objects.filter(action="organization_unit.members_changed").count(), 1)
        deactivated = client.patch(self._unit_url(parent.data["id"]), {"status": "inactive"}, format="json")
        self.assertEqual(deactivated.status_code, 200, deactivated.data)
        repeat = client.patch(self._unit_url(parent.data["id"]), {"status": "inactive"}, format="json")
        self.assertEqual(repeat.status_code, 200)
        parent_row = Department.objects.get(pk=parent.data["id"])
        child_row = Department.objects.get(pk=child.data["id"])
        person.refresh_from_db()
        self.assertEqual(parent_row.status, "inactive")
        self.assertEqual(child_row.parent_id, parent_row.id)
        self.assertEqual(person.department_id, parent_row.id)
        self.assertEqual(AuditLog.objects.filter(action="organization_unit.deactivated").count(), 1)
        self.assertFalse(AuditLog.objects.filter(action="organization_unit.updated").exists())
        renamed = client.patch(self._unit_url(child.data["id"]), {"name": "Customer Support"}, format="json")
        self.assertEqual(renamed.status_code, 200, renamed.data)
        same = client.patch(self._unit_url(child.data["id"]), {"name": "Customer Support"}, format="json")
        self.assertEqual(same.status_code, 200)
        self.assertEqual(AuditLog.objects.filter(action="organization_unit.updated").count(), 1)

    def test_unit_type_save_audits_once_and_existing_links_remain(self):
        parent = Department.objects.create(company=self.company, name="Finance & Ops")
        sibling = Department.objects.create(company=self.company, name="Finance Ops")
        child = Department.objects.create(company=self.company, name="Payroll", parent=parent)
        parent.created_at = timezone.now() - timedelta(minutes=2)
        sibling.created_at = timezone.now() - timedelta(minutes=1)
        parent.save(update_fields=["created_at"])
        sibling.save(update_fields=["created_at"])
        person = Person.objects.create(company=self.company, first_name="Ada", last_name="Miles", department=child)
        backfill_department_keys = importlib.import_module("apps.organization.migrations.0002_organization_unit_types").backfill_department_keys
        backfill_department_keys(apps, None)
        parent.refresh_from_db()
        sibling.refresh_from_db()
        child.refresh_from_db()
        person.refresh_from_db()
        self.assertEqual(parent.key, "finance-ops")
        self.assertEqual(sibling.key, "finance-ops-2")
        self.assertEqual(child.parent_id, parent.id)
        self.assertEqual(person.department_id, child.id)
        client = self._client(self.owner)
        created = client.post(self._types_url(), {"key": "Department", "singular_label": "Department"}, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["key"], "department")
        same = client.patch(self._type_url(created.data["id"]), {"singular_label": "Department"}, format="json")
        self.assertEqual(same.status_code, 200)
        self.assertEqual(AuditLog.objects.filter(action="organization_unit_type.saved").count(), 1)
        self.assertEqual(Department.objects.get(pk=child.id).parent_id, parent.id)

    def test_people_directory_lists_and_creates_people(self):
        client = self._client(self.owner)
        created = client.post(self._people_url(), {"name": "Pat Lee", "work_email": "pat@example.com", "job_title": "Analyst"}, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["first_name"], "Pat")
        self.assertEqual(created.data["job_title"], "Analyst")
        self.assertEqual(created.data["organization"], self.company.display_name)
        listed = client.get(self._people_url())
        self.assertEqual(listed.status_code, 200)
        self.assertIn("Pat", {row["first_name"] for row in listed.data["results"]})
        self.assertIn("Ada", {row["first_name"] for row in listed.data["results"]})
        visible = self._client(self.employee).get(self._people_url())
        self.assertEqual(visible.status_code, 200)
        denied = self._client(self.employee).post(self._people_url(), {"name": "Nope"}, format="json")
        self.assertEqual(denied.status_code, 403)

    def test_new_navigation_entry_appears_without_restoring_disabled_items(self):
        CompanyRoleNavigation.objects.filter(role__company=self.company, code="organization").delete()
        CompanyRoleNavigation.objects.filter(role__company=self.company, code="users").update(enabled=False)
        codes = [item["code"] for item in navigation_for(self.owner_membership)]
        self.assertIn("organization", codes)
        self.assertNotIn("users", codes)

    def _open_company(self, slug, email):
        owner = User.objects.create_user(email=email, password=PASSWORD, first_name="Ada", last_name="Owner")
        owner.email_verified_at = timezone.now()
        owner.save(update_fields=["email_verified_at", "updated_at"])
        company = Company.objects.create(slug=slug, legal_name=slug, display_name=slug, status=CompanyStatus.ACTIVE, created_by=owner)
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

    def _member(self, company, email, template_code, actor):
        user = User.objects.create_user(email=email, password=PASSWORD, first_name="Sam", last_name="Member")
        user.email_verified_at = timezone.now()
        user.save(update_fields=["email_verified_at", "updated_at"])
        membership = CompanyMembership.objects.create(company=company, user=user, status=MembershipStatus.ACTIVE, joined_at=timezone.now())
        role = CompanyRole.objects.get(company=company, template_code=template_code)
        MembershipRoleAssignment.objects.create(membership=membership, role=role, assigned_by=actor)
        return user, membership

    def _client(self, user):
        client = APIClient()
        client.force_login(user)
        return client

    def _people_url(self, company=None):
        return f"/api/v1/companies/{(company or self.company).id}/people/"

    def _units_url(self, company=None):
        return f"/api/v1/companies/{(company or self.company).id}/organization/units/"

    def _unit_url(self, unit_id):
        return f"/api/v1/companies/{self.company.id}/organization/units/{unit_id}/"

    def _members_url(self, unit_id):
        return f"/api/v1/companies/{self.company.id}/organization/units/{unit_id}/members/"

    def _types_url(self, company=None):
        return f"/api/v1/companies/{(company or self.company).id}/organization/unit-types/"

    def _type_url(self, type_id):
        return f"/api/v1/companies/{self.company.id}/organization/unit-types/{type_id}/"
