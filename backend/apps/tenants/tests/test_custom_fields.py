from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.authorization.company import bootstrap_company_access
from apps.authorization.models import CompanyRole
from apps.billing.models import BillingPlan, BillingPlanPrice, Subscription, SubscriptionStatus
from apps.identity.models import User
from apps.organization.models import Department, Person
from apps.tenants.models import Company, CompanyMembership, CompanyStatus, CustomField, MembershipStatus

PASSWORD = "a-long-passphrase"


class CustomFieldTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="fields-owner@example.com", password=PASSWORD, first_name="Ada", last_name="Owner")
        self.owner.email_verified_at = timezone.now()
        self.owner.save(update_fields=["email_verified_at", "updated_at"])
        self.company = Company.objects.create(
            slug="field-co",
            legal_name="Field Co",
            display_name="Field Co",
            status=CompanyStatus.ACTIVE,
            created_by=self.owner,
        )
        CompanyMembership.objects.create(company=self.company, user=self.owner, status=MembershipStatus.ACTIVE, joined_at=timezone.now())
        bootstrap_company_access(self.company, self.owner)
        plan = BillingPlan.objects.get(code="growth")
        price = BillingPlanPrice.objects.filter(plan=plan, billing_interval="year", currency="INR").order_by("-effective_from").first()
        Subscription.objects.create(
            company=self.company,
            plan=plan,
            plan_price=price,
            billing_interval="year",
            currency="INR",
            status=SubscriptionStatus.TRIALING,
            provider="pulse",
        )
        self.client = APIClient()
        self.client.force_login(self.owner)
        self.url = f"/api/v1/companies/{self.company.id}/custom-fields/"

    def test_create_list_and_delete_custom_fields(self):
        created = self.client.post(self.url, {"entity": "person", "name": "Cost center", "field_type": "text", "self_editable": True}, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["key"], "cost-center")
        self.assertTrue(created.data["self_editable"])
        self.assertEqual(created.data.get("help_text", ""), "")
        listed = self.client.get(self.url, {"entity": "person"})
        self.assertEqual(listed.status_code, 200)
        self.assertEqual([row["name"] for row in listed.data["results"]], ["Cost center"])
        other = self.client.get(self.url, {"entity": "company"})
        self.assertEqual(other.data["results"], [])
        missing = self.client.post(self.url, {"entity": "person", "name": "Site", "field_type": "select", "options": []}, format="json")
        self.assertEqual(missing.status_code, 400)
        deleted = self.client.delete(f"{self.url}{created.data['id']}/")
        self.assertEqual(deleted.status_code, 200, deleted.data)
        self.assertEqual(deleted.data["status"], "archived")
        self.assertTrue(CustomField.objects.filter(company=self.company, status="archived").exists())
        listed_after = self.client.get(self.url, {"entity": "person"})
        self.assertEqual(listed_after.data["results"], [])
        archived = self.client.get(self.url, {"entity": "person", "include_archived": "1"})
        self.assertEqual(len(archived.data["results"]), 1)
        self.assertTrue(AuditLog.objects.filter(company=self.company, action="custom_field.created").exists())
        self.assertTrue(AuditLog.objects.filter(company=self.company, action="custom_field.archived").exists())

    def test_slug_collision_appends_suffix(self):
        first = self.client.post(self.url, {"entity": "person", "name": "Cost center", "field_type": "text"}, format="json")
        second = self.client.post(self.url, {"entity": "person", "name": "Cost center", "field_type": "text"}, format="json")
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(second.status_code, 201, second.data)
        self.assertEqual(first.data["key"], "cost-center")
        self.assertEqual(second.data["key"], "cost-center-2")

    def test_reserved_keys_rejected_for_organization_unit(self):
        response = self.client.post(
            self.url,
            {"entity": "organization_unit", "name": "Parent", "field_type": "text"},
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("reserved", response.data["error"]["message"].lower())

    def test_patch_updates_label_and_flags_without_changing_key(self):
        created = self.client.post(
            self.url,
            {
                "entity": "organization_unit",
                "name": "Parent unit Code",
                "field_type": "text",
                "help_text": "External code",
                "required": True,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["key"], "parent-unit-code")
        patched = self.client.patch(
            f"{self.url}{created.data['id']}/",
            {"name": "Parent Unit Code", "required": False, "help_text": "Optional external code"},
            format="json",
        )
        self.assertEqual(patched.status_code, 200, patched.data)
        self.assertEqual(patched.data["key"], "parent-unit-code")
        self.assertEqual(patched.data["name"], "Parent Unit Code")
        self.assertFalse(patched.data["required"])
        self.assertEqual(patched.data["help_text"], "Optional external code")
        blocked = self.client.patch(
            f"{self.url}{created.data['id']}/",
            {"field_type": "number"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertTrue(AuditLog.objects.filter(company=self.company, action="custom_field.updated").exists())

    def test_company_settings_persist_custom_data(self):
        created = self.client.post(
            self.url,
            {
                "entity": "company",
                "name": "Industry",
                "field_type": "select",
                "options": ["Technology", "Healthcare", "Finance", "Manufacturing", "Other"],
                "help_text": "Primary industry for this company",
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["key"], "industry")

        settings_url = f"/api/v1/companies/{self.company.id}/settings/"
        listed = self.client.get(settings_url)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data.get("custom_data"), {})

        patched = self.client.patch(
            settings_url,
            {
                "legal_name": self.company.legal_name,
                "display_name": self.company.display_name,
                "timezone": self.company.timezone,
                "country_code": self.company.country_code,
                "custom_data": {"industry": "Technology"},
            },
            format="json",
        )
        self.assertEqual(patched.status_code, 200, patched.data)
        self.assertEqual(patched.data["custom_data"]["industry"], "Technology")
        self.company.refresh_from_db()
        self.assertEqual(self.company.custom_data["industry"], "Technology")

        invalid = self.client.patch(
            settings_url,
            {"custom_data": {"industry": "NotARealOption"}},
            format="json",
        )
        self.assertEqual(invalid.status_code, 400)
        unknown = self.client.patch(
            settings_url,
            {"custom_data": {"not-a-field": "x"}},
            format="json",
        )
        self.assertEqual(unknown.status_code, 400)

    def test_reference_field_requires_config_and_validates_roles(self):
        missing = self.client.post(
            self.url,
            {"entity": "person", "name": "Intended roles", "field_type": "reference"},
            format="json",
        )
        self.assertEqual(missing.status_code, 400, missing.data)
        created = self.client.post(
            self.url,
            {
                "entity": "person",
                "name": "Intended roles",
                "field_type": "reference",
                "config": {"target": "role", "multiple": True},
                "required": False,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["field_type"], "reference")
        self.assertEqual(created.data["config"]["target"], "role")
        self.assertTrue(created.data["config"]["multiple"])

        employee = CompanyRole.objects.filter(company=self.company, is_owner_role=False).first()
        self.assertIsNotNone(employee)
        people_url = f"/api/v1/companies/{self.company.id}/people/"
        ok = self.client.post(
            people_url,
            {
                "name": "Pat Lee",
                "work_email": "pat-roles@example.com",
                "job_title": "Analyst",
                "custom_data": {"intended-roles": [str(employee.id)]},
            },
            format="json",
        )
        self.assertEqual(ok.status_code, 201, ok.data)
        self.assertEqual(ok.data["custom_data"]["intended-roles"], [str(employee.id)])
        person = Person.objects.get(pk=ok.data["person_id"])
        self.assertEqual(person.custom_data["intended-roles"], [str(employee.id)])

        bad = self.client.post(
            people_url,
            {
                "name": "Sam Ray",
                "work_email": "sam-roles@example.com",
                "job_title": "Analyst",
                "custom_data": {"intended-roles": ["00000000-0000-0000-0000-000000000099"]},
            },
            format="json",
        )
        self.assertEqual(bad.status_code, 400, bad.data)

    def test_reference_targets_api_lists_available_targets(self):
        response = self.client.get(f"{self.url}reference-targets/")
        self.assertEqual(response.status_code, 200, response.data)
        ids = {row["id"] for row in response.data["results"]}
        self.assertEqual(ids, {"role", "person", "organization_unit"})

    def test_reference_field_validates_person_and_organization_unit(self):
        peer = Person.objects.create(
            company=self.company,
            first_name="Ada",
            last_name="Miles",
            work_email="ada-link@example.com",
            job_title="Lead",
        )
        unit = Department.objects.create(company=self.company, name="Engineering", key="engineering")
        person_field = self.client.post(
            self.url,
            {
                "entity": "person",
                "name": "Reports to",
                "field_type": "reference",
                "config": {"target": "person", "multiple": False},
            },
            format="json",
        )
        self.assertEqual(person_field.status_code, 201, person_field.data)
        unit_field = self.client.post(
            self.url,
            {
                "entity": "person",
                "name": "Home unit",
                "field_type": "reference",
                "config": {"target": "organization_unit", "multiple": True},
            },
            format="json",
        )
        self.assertEqual(unit_field.status_code, 201, unit_field.data)

        people_url = f"/api/v1/companies/{self.company.id}/people/"
        ok = self.client.post(
            people_url,
            {
                "name": "Pat Lee",
                "work_email": "pat-links@example.com",
                "job_title": "Analyst",
                "custom_data": {
                    "reports-to": str(peer.id),
                    "home-unit": [str(unit.id)],
                },
            },
            format="json",
        )
        self.assertEqual(ok.status_code, 201, ok.data)
        self.assertEqual(ok.data["custom_data"]["reports-to"], str(peer.id))
        self.assertEqual(ok.data["custom_data"]["home-unit"], [str(unit.id)])

        bad_person = self.client.post(
            people_url,
            {
                "name": "Sam Ray",
                "work_email": "sam-links@example.com",
                "job_title": "Analyst",
                "custom_data": {"reports-to": "00000000-0000-0000-0000-000000000099"},
            },
            format="json",
        )
        self.assertEqual(bad_person.status_code, 400, bad_person.data)
        bad_unit = self.client.post(
            people_url,
            {
                "name": "Jo Ray",
                "work_email": "jo-links@example.com",
                "job_title": "Analyst",
                "custom_data": {"home-unit": ["00000000-0000-0000-0000-000000000099"]},
            },
            format="json",
        )
        self.assertEqual(bad_unit.status_code, 400, bad_unit.data)

    def test_phone_indian_mobile_validation(self):
        created = self.client.post(
            self.url,
            {
                "entity": "person",
                "name": "Mobile",
                "field_type": "phone",
                "validation": {"pattern": "indian_mobile"},
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["config"]["validation"]["pattern"], "indian_mobile")
        self.assertEqual(created.data["config"]["validation"]["min_length"], 10)
        self.assertEqual(created.data["config"]["validation"]["max_length"], 10)

        people_url = f"/api/v1/companies/{self.company.id}/people/"
        bad = self.client.post(
            people_url,
            {
                "name": "Bad Phone",
                "work_email": "bad-phone@example.com",
                "job_title": "Analyst",
                "custom_data": {"mobile": "123"},
            },
            format="json",
        )
        self.assertEqual(bad.status_code, 400, bad.data)

        ok = self.client.post(
            people_url,
            {
                "name": "Ok Phone",
                "work_email": "ok-phone@example.com",
                "job_title": "Analyst",
                "custom_data": {"mobile": "98765-43210"},
            },
            format="json",
        )
        self.assertEqual(ok.status_code, 201, ok.data)
        self.assertEqual(ok.data["custom_data"]["mobile"], "9876543210")

    def test_number_and_text_validation_rules(self):
        number_field = self.client.post(
            self.url,
            {
                "entity": "person",
                "name": "Headcount",
                "field_type": "number",
                "validation": {"min": 1, "max": 10, "integer_only": True},
            },
            format="json",
        )
        self.assertEqual(number_field.status_code, 201, number_field.data)
        self.assertEqual(number_field.data["config"]["validation"]["min"], 1.0)
        self.assertTrue(number_field.data["config"]["validation"]["integer_only"])

        text_field = self.client.post(
            self.url,
            {
                "entity": "person",
                "name": "Badge code",
                "field_type": "text",
                "validation": {"min_length": 4, "max_length": 8},
            },
            format="json",
        )
        self.assertEqual(text_field.status_code, 201, text_field.data)

        people_url = f"/api/v1/companies/{self.company.id}/people/"
        too_small = self.client.post(
            people_url,
            {
                "name": "Num Low",
                "work_email": "num-low@example.com",
                "job_title": "Analyst",
                "custom_data": {"headcount": 0},
            },
            format="json",
        )
        self.assertEqual(too_small.status_code, 400, too_small.data)

        not_int = self.client.post(
            people_url,
            {
                "name": "Num Float",
                "work_email": "num-float@example.com",
                "job_title": "Analyst",
                "custom_data": {"headcount": 2.5},
            },
            format="json",
        )
        self.assertEqual(not_int.status_code, 400, not_int.data)

        short_text = self.client.post(
            people_url,
            {
                "name": "Text Short",
                "work_email": "text-short@example.com",
                "job_title": "Analyst",
                "custom_data": {"badge-code": "ab"},
            },
            format="json",
        )
        self.assertEqual(short_text.status_code, 400, short_text.data)

        ok = self.client.post(
            people_url,
            {
                "name": "Valid Rules",
                "work_email": "valid-rules@example.com",
                "job_title": "Analyst",
                "custom_data": {"headcount": 5, "badge-code": "ABCD"},
            },
            format="json",
        )
        self.assertEqual(ok.status_code, 201, ok.data)
        self.assertEqual(ok.data["custom_data"]["headcount"], 5.0)
        self.assertEqual(ok.data["custom_data"]["badge-code"], "ABCD")

    def test_invalid_validation_payload_rejected(self):
        bad_pattern = self.client.post(
            self.url,
            {
                "entity": "person",
                "name": "Weird phone",
                "field_type": "phone",
                "validation": {"pattern": "regex_freeform"},
            },
            format="json",
        )
        self.assertEqual(bad_pattern.status_code, 400, bad_pattern.data)

        bad_type = self.client.post(
            self.url,
            {
                "entity": "person",
                "name": "Linked",
                "field_type": "reference",
                "config": {"target": "role", "multiple": True, "validation": {"min_length": 1}},
            },
            format="json",
        )
        self.assertEqual(bad_type.status_code, 400, bad_type.data)

        unknown_key = self.client.post(
            self.url,
            {
                "entity": "person",
                "name": "Age",
                "field_type": "number",
                "validation": {"min": 0, "unit": "years"},
            },
            format="json",
        )
        self.assertEqual(unknown_key.status_code, 400, unknown_key.data)
