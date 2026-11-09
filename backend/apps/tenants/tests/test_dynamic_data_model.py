import hashlib
import secrets
from datetime import timedelta

from django.test import RequestFactory, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authorization.company import bootstrap_company_access, ensure_company_catalog
from apps.authorization.models import CompanyRole, CompanyRolePermission, MembershipRoleAssignment
from apps.billing.models import BillingPlan, BillingPlanPrice, Subscription, SubscriptionStatus
from apps.identity.models import User
from apps.organization.models import Person
from apps.tenants.invitations import accept_invitation
from apps.tenants.models import (
    Company,
    CompanyMembership,
    CompanyStatus,
    CustomEntity,
    CustomEntityField,
    CustomField,
    FieldEntity,
    FieldType,
    InvitationStatus,
    MembershipInvitation,
    MembershipStatus,
)
from common.api.exceptions import PulseAPIException

PASSWORD = "a-long-passphrase"


class DynamicDataModelTests(TestCase):
    def setUp(self):
        ensure_company_catalog()
        self.owner = User.objects.create_user(
            email="ddm-owner@example.com", password=PASSWORD, first_name="Ada", last_name="Owner"
        )
        self.owner.email_verified_at = timezone.now()
        self.owner.save(update_fields=["email_verified_at", "updated_at"])
        self.company = Company.objects.create(
            slug="ddm-co",
            legal_name="DDM Co",
            display_name="DDM Co",
            status=CompanyStatus.ACTIVE,
            created_by=self.owner,
        )
        CompanyMembership.objects.create(
            company=self.company, user=self.owner, status=MembershipStatus.ACTIVE, joined_at=timezone.now()
        )
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

    def test_accepted_at_set_on_invitation_accept(self):
        token = secrets.token_urlsafe(16)
        invitee = User.objects.create_user(email="join-ddm@example.com", password=PASSWORD)
        invitee.email_verified_at = timezone.now()
        invitee.save(update_fields=["email_verified_at", "updated_at"])
        invitation = MembershipInvitation.objects.create(
            company=self.company,
            email=invitee.email,
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            invited_by=self.owner,
            expires_at=timezone.now() + timedelta(days=7),
            custom_data={"source": "referral"},
        )
        request = RequestFactory().post("/api/v1/invitations/accept/")
        request.user = invitee
        accept_invitation(request=request, invitation=invitation, user=invitee)
        invitation.refresh_from_db()
        self.assertEqual(invitation.status, InvitationStatus.ACCEPTED)
        self.assertIsNotNone(invitation.accepted_at)
        person = Person.objects.filter(company=self.company, work_email=invitee.email).first()
        self.assertIsNotNone(person)
        self.assertEqual(person.custom_data or {}, {})
        joined = CompanyMembership.objects.get(company=self.company, user=invitee)
        self.assertEqual(joined.custom_data or {}, {})

    def test_invitation_links_existing_person_without_creating_duplicate(self):
        person = Person.objects.create(
            company=self.company,
            first_name="Jo",
            last_name="Employee",
            work_email="jo-link@example.com",
        )
        invitee = User.objects.create_user(email="jo-link@example.com", password=PASSWORD)
        invitee.email_verified_at = timezone.now()
        invitee.save(update_fields=["email_verified_at", "updated_at"])
        invitation = MembershipInvitation.objects.create(
            company=self.company,
            person=person,
            email=invitee.email,
            token_hash=hashlib.sha256(secrets.token_urlsafe(16).encode()).hexdigest(),
            invited_by=self.owner,
            expires_at=timezone.now() + timedelta(days=7),
        )
        request = RequestFactory().post("/api/v1/invitations/accept/")
        request.user = invitee
        accept_invitation(request=request, invitation=invitation, user=invitee)
        self.assertEqual(Person.objects.filter(company=self.company, work_email__iexact=invitee.email).count(), 1)
        membership = CompanyMembership.objects.get(company=self.company, user=invitee)
        self.assertEqual(membership.person_id, person.id)

    def test_ambiguous_invitation_email_requires_manual_resolution(self):
        Person.objects.create(company=self.company, first_name="First", work_email="duplicate@example.com")
        Person.objects.create(company=self.company, first_name="Second", work_email="Duplicate@example.com")
        invitee = User.objects.create_user(email="duplicate@example.com", password=PASSWORD)
        invitee.email_verified_at = timezone.now()
        invitee.save(update_fields=["email_verified_at", "updated_at"])
        invitation = MembershipInvitation.objects.create(
            company=self.company,
            email=invitee.email,
            token_hash=hashlib.sha256(secrets.token_urlsafe(16).encode()).hexdigest(),
            invited_by=self.owner,
            expires_at=timezone.now() + timedelta(days=7),
        )
        request = RequestFactory().post("/api/v1/invitations/accept/")
        request.user = invitee
        with self.assertRaises(PulseAPIException):
            accept_invitation(request=request, invitation=invitation, user=invitee)
        self.assertFalse(CompanyMembership.objects.filter(company=self.company, user=invitee).exists())

    def test_invitation_does_not_relink_existing_membership_to_different_person(self):
        person = Person.objects.create(company=self.company, first_name="Linked", work_email="linked@example.com")
        other_person = Person.objects.create(company=self.company, first_name="Other", work_email="other@example.com")
        invitee = User.objects.create_user(email="linked@example.com", password=PASSWORD)
        invitee.email_verified_at = timezone.now()
        invitee.save(update_fields=["email_verified_at", "updated_at"])
        CompanyMembership.objects.create(
            company=self.company,
            user=invitee,
            person=other_person,
            status=MembershipStatus.ACTIVE,
            joined_at=timezone.now(),
        )
        invitation = MembershipInvitation.objects.create(
            company=self.company,
            person=person,
            email=invitee.email,
            token_hash=hashlib.sha256(secrets.token_urlsafe(16).encode()).hexdigest(),
            invited_by=self.owner,
            expires_at=timezone.now() + timedelta(days=7),
        )
        request = RequestFactory().post("/api/v1/invitations/accept/")
        request.user = invitee
        with self.assertRaises(PulseAPIException):
            accept_invitation(request=request, invitation=invitation, user=invitee)
        membership = CompanyMembership.objects.get(company=self.company, user=invitee)
        self.assertEqual(membership.person_id, other_person.id)

    def test_sensitive_custom_data_redacted_without_elevated_permission(self):
        CustomField.objects.create(
            company=self.company,
            entity=FieldEntity.PERSON,
            name="SSN",
            key="ssn",
            field_type=FieldType.TEXT,
            sensitive=True,
        )
        person = Person.objects.create(
            company=self.company,
            first_name="Ada",
            last_name="Lovelace",
            work_email="ada-ddm@example.com",
            job_title="Engineer",
            custom_data={"ssn": "123-45-6789"},
        )
        listed = self.client.get(f"/api/v1/companies/{self.company.id}/people/?status=all")
        self.assertEqual(listed.status_code, 200)
        row = next(item for item in listed.data["results"] if item["person_id"] == str(person.id))
        self.assertEqual(row["custom_data"].get("ssn"), "123-45-6789")

        viewer = User.objects.create_user(email="viewer-ddm@example.com", password=PASSWORD)
        viewer.email_verified_at = timezone.now()
        viewer.save(update_fields=["email_verified_at", "updated_at"])
        viewer_person = Person.objects.create(
            company=self.company,
            first_name="View",
            last_name="Only",
            work_email=viewer.email,
            job_title="Staff",
        )
        viewer_membership = CompanyMembership.objects.create(
            company=self.company,
            user=viewer,
            status=MembershipStatus.ACTIVE,
            person=viewer_person,
            joined_at=timezone.now(),
        )
        role = CompanyRole.objects.create(company=self.company, name="Limited Viewer", is_system=False)
        for code in ("company.view", "people.view"):
            CompanyRolePermission.objects.get_or_create(role=role, permission_id=code)
        MembershipRoleAssignment.objects.create(membership=viewer_membership, role=role)
        viewer_client = APIClient()
        viewer_client.force_login(viewer)
        limited = viewer_client.get(f"/api/v1/companies/{self.company.id}/people/?status=all")
        self.assertEqual(limited.status_code, 200)
        limited_row = next(item for item in limited.data["results"] if item["person_id"] == str(person.id))
        self.assertNotIn("ssn", limited_row["custom_data"])

    def test_person_update_persists_custom_data(self):
        CustomField.objects.create(
            company=self.company,
            entity=FieldEntity.PERSON,
            name="Code",
            key="code",
            field_type=FieldType.TEXT,
        )
        person = Person.objects.create(
            company=self.company,
            first_name="Grace",
            last_name="Hopper",
            work_email="grace-ddm@example.com",
            job_title="Engineer",
        )
        patched = self.client.patch(
            f"/api/v1/companies/{self.company.id}/people/{person.id}/",
            {"custom_data": {"code": "GH-1"}},
            format="json",
        )
        self.assertEqual(patched.status_code, 200, patched.data)
        person.refresh_from_db()
        self.assertEqual(person.custom_data["code"], "GH-1")

    def test_invitation_custom_fields_create(self):
        CustomField.objects.create(
            company=self.company,
            entity=FieldEntity.INVITATION,
            name="Source",
            key="source",
            field_type=FieldType.TEXT,
            required=True,
        )
        created = self.client.post(
            f"/api/v1/companies/{self.company.id}/invitations/",
            {"email": "newhire-ddm@example.com", "custom_data": {"source": "linkedin"}},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["custom_data"]["source"], "linkedin")
        self.assertIsNone(created.data.get("accepted_at"))

    def test_custom_entity_records_company_scoped(self):
        entity = CustomEntity.objects.create(company=self.company, key="queue", name="Queue")
        CustomEntityField.objects.create(
            company=self.company,
            entity=entity,
            name="Name",
            key="name",
            field_type=FieldType.TEXT,
            required=True,
            is_primary=True,
        )
        other = Company.objects.create(
            slug="other-ddm",
            legal_name="Other Ltd",
            display_name="Other",
            status=CompanyStatus.ACTIVE,
            created_by=self.owner,
        )
        other_entity = CustomEntity.objects.create(company=other, key="queue", name="Queue")
        created = self.client.post(
            f"/api/v1/companies/{self.company.id}/custom-entities/{entity.id}/records/",
            {"data": {"name": "Priority inbox"}},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        listed = self.client.get(f"/api/v1/companies/{self.company.id}/custom-entities/{entity.id}/records/")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data["count"], 1)
        missing = self.client.get(f"/api/v1/companies/{self.company.id}/custom-entities/{other_entity.id}/records/")
        self.assertEqual(missing.status_code, 404)

    def test_reserved_invitation_key_rejected(self):
        bad = self.client.post(
            f"/api/v1/companies/{self.company.id}/custom-fields/",
            {"entity": "invitation", "name": "Accepted At", "field_type": "text"},
            format="json",
        )
        self.assertEqual(bad.status_code, 400)
