"""Seed Aether Precision manufacturing demo company from docs/demo-data/02-manufacturing-company.md.

Order: catalogs → company → custom fields → unit types → units → people →
memberships/roles → invitations → custom entities/records → verify filters/isolation.

Does not change schema. Idempotent with --reset (deletes slug aether-precision first).
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone as dt_timezone
from types import SimpleNamespace

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from django.test import RequestFactory
from rest_framework.request import Request

from apps.audit.models import AuditLog
from apps.authorization.company import bootstrap_company_access, ensure_company_catalog, effective_permission_codes
from apps.authorization.models import CompanyRole, MembershipRoleAssignment
from apps.authorization.services import ensure_platform_catalog
from apps.billing.models import BillingPlan, BillingPlanEntitlement, BillingPlanPrice, Subscription, SubscriptionStatus
from apps.identity.models import User
from apps.modules_registry.manifests import MODULES
from apps.modules_registry.models import ModuleDefinition
from apps.organization.models import Department, OrganizationUnitType, Person, PersonStatus, UnitStatus
from apps.tenants.custom_fields import normalize_custom_data
from apps.tenants.custom_entities import list_records, normalize_record_data
from apps.tenants.models import (
    Announcement,
    Company,
    CompanyBillingProfile,
    CompanyMembership,
    CompanyNotification,
    CompanyStatus,
    CustomEntity,
    CustomEntityField,
    CustomEntityRecord,
    CustomField,
    FieldEntity,
    FieldStatus,
    FieldType,
    InvitationStatus,
    MembershipInvitation,
    MembershipStatus,
    NotificationPreference,
    OnboardingState,
)

OWNER_EMAIL = "suresh.patil@aetherprecision.example"
OWNER_PASSWORD = "a-long-passphrase"
SLUG = "aether-precision"
ISOLATION_SLUG = "demo-isolation-co"
EFFECTIVE_FROM = datetime(2026, 10, 17, tzinfo=dt_timezone.utc)


def _req(user):
    return SimpleNamespace(user=user, META={}, headers={})


class Command(BaseCommand):
    help = "Seed the Aether Precision manufacturing demo tenant (docs/demo-data/02-manufacturing-company.md)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help=f"Delete existing company slug={SLUG} (and isolation company) before seeding.",
        )
        parser.add_argument(
            "--skip-verify",
            action="store_true",
            help="Skip §J filter and cross-company isolation checks.",
        )
        parser.add_argument("--password", default=OWNER_PASSWORD, help="Password for demo membership users.")

    def handle(self, *args, **options):
        password = options["password"]
        from apps.tenants.demo_seeders.manufacturing import seed_manufacturing_company
        from apps.tenants.demo_seeders.base import StatsCollector
        stats = StatsCollector()
        with transaction.atomic():
            self._ensure_catalogs()
            if options.get("reset"):
                self._reset()
            seed_manufacturing_company(password=password, stats=stats)
        self.stdout.write(self.style.SUCCESS("Seeded company Aether Precision (aether-precision)"))
        self.stdout.write(f"Owner login: {OWNER_EMAIL} / (password you passed, default a-long-passphrase)")

    def _ensure_catalogs(self):
        ensure_platform_catalog()
        ensure_company_catalog()
        for item in MODULES:
            ModuleDefinition.objects.update_or_create(
                slug=item["slug"],
                defaults={
                    "display_name": item["display_name"],
                    "description": item["description"],
                    "version": item["version"],
                    "django_app_label": item["django_app_label"],
                    "min_platform_version": "0.1.0",
                    "is_core": item["is_core"],
                    "is_public": item["is_public"],
                    "installation_available": item["installation_available"],
                    "config_schema": {},
                },
            )
        plan, _ = BillingPlan.objects.get_or_create(
            code="growth",
            defaults={
                "name": "Growth",
                "description": "Company plan with a 14-day trial.",
                "is_active": True,
                "is_public": True,
                "trial_days": 14,
            },
        )
        for interval, amount in (("month", 249900), ("year", 2499900)):
            BillingPlanPrice.objects.get_or_create(
                plan=plan,
                billing_interval=interval,
                currency="INR",
                effective_from=EFFECTIVE_FROM,
                defaults={"amount_minor": amount, "is_active": True},
            )
        for key, value in (
            ("max_people", 50),
            ("dashboards_enabled", True),
            ("included_module_slugs", ["hrms"]),
        ):
            BillingPlanEntitlement.objects.update_or_create(
                plan=plan, entitlement_key=key, defaults={"entitlement_value": value}
            )
        self.stdout.write("Catalogs/plans ready.")

    def _reset(self):
        for slug in (SLUG, ISOLATION_SLUG):
            company = Company.objects.filter(slug=slug).first()
            if company is None:
                continue
            emails = list(
                CompanyMembership.objects.filter(company=company).values_list("user__email", flat=True)
            )
            # PROTECT FKs require ordered teardown (memberships→people, managers→units, etc.).
            MembershipRoleAssignment.objects.filter(membership__company=company).delete()
            CompanyMembership.objects.filter(company=company).update(person=None)
            CompanyMembership.objects.filter(company=company).delete()
            MembershipInvitation.objects.filter(company=company).delete()
            CustomEntityRecord.objects.filter(company=company).delete()
            CustomEntityField.objects.filter(company=company).delete()
            CustomEntity.objects.filter(company=company).delete()
            CustomField.objects.filter(company=company).delete()
            CompanyNotification.objects.filter(company=company).delete()
            Announcement.objects.filter(company=company).delete()
            NotificationPreference.objects.filter(company=company).delete()
            AuditLog.objects.filter(company=company).delete()
            Department.objects.filter(company=company).update(manager=None, parent=None, unit_type=None)
            Person.objects.filter(company=company).update(department=None)
            Person.objects.filter(company=company).delete()
            Department.objects.filter(company=company).delete()
            OrganizationUnitType.objects.filter(company=company).delete()
            Subscription.objects.filter(company=company).delete()
            CompanyRole.objects.filter(company=company).delete()
            OnboardingState.objects.filter(company=company).delete()
            CompanyBillingProfile.objects.filter(company=company).delete()
            company.delete()
            for email in emails:
                if not email:
                    continue
                if not (email.endswith("@aetherprecision.example") or email.endswith("@isolation.example")):
                    continue
                user = User.objects.filter(email=email).first()
                if user and not CompanyMembership.objects.filter(user=user).exists():
                    user.delete()
            self.stdout.write(f"Removed company slug={slug}.")

    def _seed_all(self, password):
        owner = self._owner_user(password)
        company = self._create_company(owner)
        ids = {"company": str(company.id), "demo_company_id": "CO-MFG-001"}
        self._custom_fields(company)
        self._company_custom_data(company, owner)
        types = self._unit_types(company)
        units = self._units(company, types)
        people = self._people(company, owner, units)
        self._unit_managers(units, people)
        memberships = self._memberships(company, owner, people, password)
        invitations = self._invitations(company, owner)
        entities = self._custom_entities(company, owner, people, units)
        isolation = self._isolation_company(password)
        return {
            "company": company,
            "owner": owner,
            "people": people,
            "units": units,
            "memberships": memberships,
            "invitations": invitations,
            "entities": entities,
            "ids": ids,
            "isolation": isolation,
        }

    def _owner_user(self, password):
        user = User.objects.filter(email=OWNER_EMAIL).first()
        if user is None:
            user = User.objects.create_user(
                email=OWNER_EMAIL,
                password=password,
                first_name="Suresh",
                last_name="Patil",
                email_verified_at=timezone.now(),
            )
        else:
            user.set_password(password)
            user.first_name = "Suresh"
            user.last_name = "Patil"
            user.email_verified_at = user.email_verified_at or timezone.now()
            user.save()
        return user

    def _create_company(self, owner):
        now = timezone.now()
        company = Company.objects.create(
            slug=SLUG,
            legal_name="Aether Precision Components Private Limited",
            display_name="Aether Precision",
            status=CompanyStatus.ACTIVE,
            country_code="IN",
            timezone="Asia/Kolkata",
            created_by=owner,
        )
        CompanyMembership.objects.create(
            company=company, user=owner, status=MembershipStatus.ACTIVE, joined_at=now
        )
        OnboardingState.objects.create(
            company=company,
            owner=owner,
            email_verified_at=owner.email_verified_at,
            company_created_at=now,
            profile_completed_at=now,
            billing_profile_completed_at=now,
            plan_selected_at=now,
            subscription_activated_at=now,
            workspace_entered_at=now,
        )
        bootstrap_company_access(company, owner)
        plan = BillingPlan.objects.get(code="growth")
        price = (
            BillingPlanPrice.objects.filter(plan=plan, billing_interval="year", currency="INR")
            .order_by("-effective_from")
            .first()
        )
        Subscription.objects.create(
            company=company,
            plan=plan,
            plan_price=price,
            billing_interval="year",
            currency="INR",
            status=SubscriptionStatus.TRIALING,
            provider="pulse",
        )
        return company

    def _cf(self, company, entity, name, key, field_type, **kwargs):
        options = kwargs.pop("options", [])
        config = kwargs.pop("config", {})
        defaults = {
            "name": name,
            "field_type": field_type,
            "options": options,
            "config": config,
            "required": kwargs.pop("required", False),
            "sensitive": kwargs.pop("sensitive", False),
            "self_editable": kwargs.pop("self_editable", True),
            "filterable": kwargs.pop("filterable", False),
            "help_text": kwargs.pop("help_text", ""),
            "status": FieldStatus.ACTIVE,
            "position": CustomField.objects.filter(company=company, entity=entity).count(),
        }
        row, _ = CustomField.objects.update_or_create(
            company=company, entity=entity, key=key, defaults=defaults
        )
        return row

    def _custom_fields(self, company):
        # Company
        self._cf(
            company,
            FieldEntity.COMPANY,
            "Industry",
            "industry",
            FieldType.SELECT,
            required=True,
            options=["Technology", "Manufacturing", "Retail", "Services", "Other"],
            filterable=True,
        )
        self._cf(
            company,
            FieldEntity.COMPANY,
            "Company size",
            "company-size",
            FieldType.SELECT,
            options=["1-10", "11-50", "51-200", "201-1000", "1000+"],
        )
        self._cf(company, FieldEntity.COMPANY, "Website", "website", FieldType.URL)
        self._cf(
            company,
            FieldEntity.COMPANY,
            "Founded year",
            "founded-year",
            FieldType.NUMBER,
            config={"validation": {"integer_only": True}},
        )
        self._cf(company, FieldEntity.COMPANY, "About", "about", FieldType.LONG_TEXT)
        self._cf(company, FieldEntity.COMPANY, "Support email", "support-email", FieldType.EMAIL)
        self._cf(
            company,
            FieldEntity.COMPANY,
            "WhatsApp business",
            "whatsapp-business",
            FieldType.PHONE,
            config={"validation": {"pattern": "indian_mobile", "min_length": 10, "max_length": 10}},
        )
        self._cf(
            company,
            FieldEntity.COMPANY,
            "Plant count",
            "plant-count",
            FieldType.NUMBER,
            config={"validation": {"integer_only": True, "min": 1}},
        )
        self._cf(
            company,
            FieldEntity.COMPANY,
            "Primary end market",
            "primary-end-market",
            FieldType.SELECT,
            options=["Automotive", "Industrial", "Aerospace", "Other"],
        )
        self._cf(
            company,
            FieldEntity.COMPANY,
            "ISO certification",
            "iso-certification",
            FieldType.MULTI_SELECT,
            options=["ISO 9001", "IATF 16949", "ISO 14001", "None"],
        )

        # Organization unit
        for name, key, ftype, opts, filt in (
            ("Cost center code", "cost-center-code", FieldType.TEXT, [], False),
            ("Floor / location", "floor-location", FieldType.TEXT, [], False),
            ("Headcount budget", "headcount-budget", FieldType.NUMBER, [], False),
            ("Unit type tag", "unit-type-tag", FieldType.SELECT, ["HQ", "Branch", "Remote", "Support"], True),
            ("Active from", "active-from", FieldType.DATE, [], False),
            (
                "Production area",
                "production-area",
                FieldType.SELECT,
                ["Machining", "Finishing", "Assembly", "Stores", "Office", "N/A"],
                True,
            ),
            (
                "Shift type",
                "shift-type",
                FieldType.SELECT,
                ["General", "A/B/C rotating", "Night only", "N/A"],
                True,
            ),
        ):
            cfg = {"validation": {"integer_only": True}} if ftype == FieldType.NUMBER else {}
            self._cf(
                company,
                FieldEntity.ORGANIZATION_UNIT,
                name,
                key,
                ftype,
                options=opts,
                filterable=filt,
                config=cfg,
            )

        # Person
        self._cf(company, FieldEntity.PERSON, "Employee ID", "employee-id", FieldType.TEXT, required=True, filterable=True)
        self._cf(company, FieldEntity.PERSON, "Date of joining", "date-of-joining", FieldType.DATE, required=True)
        self._cf(
            company,
            FieldEntity.PERSON,
            "Employment type",
            "employment-type",
            FieldType.SELECT,
            required=True,
            options=["Full-time", "Contract", "Intern"],
            filterable=True,
        )
        self._cf(
            company,
            FieldEntity.PERSON,
            "Personal phone",
            "personal-phone",
            FieldType.PHONE,
            config={"validation": {"pattern": "indian_mobile", "min_length": 10, "max_length": 10}},
        )
        self._cf(
            company,
            FieldEntity.PERSON,
            "Skills",
            "skills",
            FieldType.MULTI_SELECT,
            options=["CNC", "Quality", "Maintenance", "Welding", "Logistics", "HR", "Finance", "Sales", "Safety"],
        )
        self._cf(
            company,
            FieldEntity.PERSON,
            "Manager",
            "manager",
            FieldType.REFERENCE,
            config={"target": "person", "multiple": False},
        )
        self._cf(
            company,
            FieldEntity.PERSON,
            "Shift",
            "shift",
            FieldType.SELECT,
            options=["General", "Shift A", "Shift B", "Shift C"],
            filterable=True,
        )
        self._cf(
            company,
            FieldEntity.PERSON,
            "Safety certification",
            "safety-certification",
            FieldType.MULTI_SELECT,
            options=["Basic EHS", "Forklift", "Confined space", "Electrical L1", "None"],
        )
        self._cf(
            company,
            FieldEntity.PERSON,
            "Machine qualification",
            "machine-qualification",
            FieldType.MULTI_SELECT,
            options=["VMC", "HMC", "Lathe", "Grinder", "CMM", "None"],
        )

        # Invitation
        self._cf(
            company,
            FieldEntity.INVITATION,
            "Invite reason",
            "invite-reason",
            FieldType.SELECT,
            options=["New hire", "Contractor", "Partner", "Other"],
            filterable=True,
        )
        self._cf(company, FieldEntity.INVITATION, "Start date", "start-date", FieldType.DATE)
        self._cf(company, FieldEntity.INVITATION, "Suggested role", "suggested-role", FieldType.TEXT)
        self._cf(company, FieldEntity.INVITATION, "Onboarding buddy email", "onboarding-buddy-email", FieldType.EMAIL)
        self._cf(company, FieldEntity.INVITATION, "Welcome note", "welcome-note", FieldType.LONG_TEXT)

        # Membership
        self._cf(
            company,
            FieldEntity.MEMBERSHIP,
            "Access level note",
            "access-level-note",
            FieldType.SELECT,
            options=["Standard", "Elevated", "Temporary"],
            filterable=True,
        )
        self._cf(company, FieldEntity.MEMBERSHIP, "Probation end date", "probation-end-date", FieldType.DATE)
        self._cf(company, FieldEntity.MEMBERSHIP, "Desk / seat", "desk-seat", FieldType.TEXT)
        self._cf(
            company,
            FieldEntity.MEMBERSHIP,
            "Preferred language",
            "preferred-language",
            FieldType.SELECT,
            options=["English", "Hindi", "Malayalam", "Other"],
        )
        self._cf(
            company,
            FieldEntity.MEMBERSHIP,
            "Internal notes",
            "internal-notes",
            FieldType.LONG_TEXT,
            sensitive=True,
            self_editable=False,
        )
        self.stdout.write("Custom field definitions created.")

    def _company_custom_data(self, company, owner):
        codes = {"company.update", "people.update", "departments.manage", "membership.invite", "membership.update"}
        data = normalize_custom_data(
            company,
            FieldEntity.COMPANY,
            {
                "industry": "Manufacturing",
                "company-size": "201-1000",
                "website": "https://www.aetherprecision.example",
                "founded-year": 2009,
                "about": (
                    "Aether Precision machines metal components for automotive OEMs and industrial equipment makers. "
                    "Primary plant is in Pune (Chakan); a secondary finishing plant operates in Chennai (Sriperumbudur)."
                ),
                "support-email": "support@aetherprecision.example",
                "whatsapp-business": "9876502001",
                "plant-count": 2,
                "primary-end-market": "Automotive",
                "iso-certification": ["ISO 9001", "IATF 16949"],
            },
            creating=True,
            existing={},
            permission_codes=codes,
        )
        company.custom_data = data
        company.save(update_fields=["custom_data", "updated_at"])

    def _unit_types(self, company):
        # Replace empty defaults with manufacturing-oriented types.
        OrganizationUnitType.objects.filter(company=company).delete()
        specs = [
            ("division", "Division", "Divisions", 0, []),
            ("plant", "Plant", "Plants", 1, ["division"]),
            ("department", "Department", "Departments", 2, ["plant", "division"]),
            ("team", "Team", "Teams", 3, ["department"]),
            ("line", "Production line group", "Production line groups", 4, ["department"]),
        ]
        out = {}
        for key, singular, plural, position, parents in specs:
            out[key] = OrganizationUnitType.objects.create(
                company=company,
                key=key,
                singular_label=singular,
                plural_label=plural,
                position=position,
                is_active=True,
                allowed_parent_keys=parents,
            )
        self.stdout.write("Unit types created.")
        return out

    def _units(self, company, types):
        codes = {"departments.manage", "people.update"}
        # demo_id -> (name, key, type_key, parent_demo, custom)
        specs = [
            (
                "OU-MFG-CORP",
                "Corporate — Pune Office",
                "corp",
                "division",
                None,
                {
                    "cost-center-code": "CC-CORP",
                    "floor-location": "Baner · Floor 2",
                    "headcount-budget": 30,
                    "unit-type-tag": "HQ",
                    "active-from": "2009-04-01",
                    "production-area": "Office",
                    "shift-type": "General",
                },
            ),
            (
                "OU-MFG-HR",
                "Human Resources",
                "hr",
                "department",
                "OU-MFG-CORP",
                {
                    "cost-center-code": "CC-HR",
                    "floor-location": "Baner · 2B",
                    "headcount-budget": 5,
                    "unit-type-tag": "Support",
                    "active-from": "2009-04-01",
                    "production-area": "Office",
                    "shift-type": "General",
                },
            ),
            (
                "OU-MFG-FIN",
                "Finance",
                "finance",
                "department",
                "OU-MFG-CORP",
                {
                    "cost-center-code": "CC-FIN",
                    "floor-location": "Baner · 2C",
                    "headcount-budget": 6,
                    "active-from": "2009-04-01",
                    "production-area": "Office",
                    "shift-type": "General",
                },
            ),
            (
                "OU-MFG-QA-C",
                "Quality Assurance (corporate)",
                "qa-corporate",
                "department",
                "OU-MFG-CORP",
                {
                    "cost-center-code": "CC-QA",
                    "floor-location": "Baner · 2D",
                    "headcount-budget": 8,
                    "active-from": "2012-01-01",
                    "production-area": "Office",
                    "shift-type": "General",
                },
            ),
            (
                "OU-MFG-PUN",
                "Pune Plant — Chakan",
                "pune-plant",
                "plant",
                None,
                {
                    "cost-center-code": "CC-PUN",
                    "floor-location": "Chakan Shed 1–3",
                    "headcount-budget": 160,
                    "unit-type-tag": "Branch",
                    "active-from": "2010-08-01",
                    "production-area": "Machining",
                    "shift-type": "A/B/C rotating",
                },
            ),
            (
                "OU-MFG-PROD-P",
                "Production",
                "production-pune",
                "department",
                "OU-MFG-PUN",
                {
                    "cost-center-code": "CC-PUN-PR",
                    "floor-location": "Shed 1",
                    "headcount-budget": 100,
                    "active-from": "2010-08-01",
                    "production-area": "Machining",
                    "shift-type": "A/B/C rotating",
                },
            ),
            (
                "OU-MFG-CNC-A",
                "CNC Cell A",
                "cnc-cell-a",
                "line",
                "OU-MFG-PROD-P",
                {
                    "cost-center-code": "CC-PUN-A",
                    "floor-location": "Shed 1 · Bay A",
                    "headcount-budget": 32,
                    "active-from": "2014-05-01",
                    "production-area": "Machining",
                    "shift-type": "A/B/C rotating",
                },
            ),
            (
                "OU-MFG-CNC-B",
                "CNC Cell B",
                "cnc-cell-b",
                "line",
                "OU-MFG-PROD-P",
                {
                    "cost-center-code": "CC-PUN-B",
                    "floor-location": "Shed 1 · Bay B",
                    "headcount-budget": 30,
                    "active-from": "2016-09-01",
                    "production-area": "Machining",
                    "shift-type": "A/B/C rotating",
                },
            ),
            (
                "OU-MFG-MNT-P",
                "Maintenance",
                "maintenance-pune",
                "department",
                "OU-MFG-PUN",
                {
                    "cost-center-code": "CC-PUN-MT",
                    "floor-location": "Shed 2",
                    "headcount-budget": 14,
                    "active-from": "2010-08-01",
                    "production-area": "Machining",
                    "shift-type": "General",
                },
            ),
            (
                "OU-MFG-STO-P",
                "Stores & Logistics",
                "stores-pune",
                "department",
                "OU-MFG-PUN",
                {
                    "cost-center-code": "CC-PUN-ST",
                    "floor-location": "Shed 3",
                    "headcount-budget": 12,
                    "active-from": "2010-08-01",
                    "production-area": "Stores",
                    "shift-type": "General",
                },
            ),
            (
                "OU-MFG-CHN",
                "Chennai Plant — Sriperumbudur",
                "chennai-plant",
                "plant",
                None,
                {
                    "cost-center-code": "CC-CHN",
                    "floor-location": "SIPCOT Plot 12",
                    "headcount-budget": 70,
                    "unit-type-tag": "Branch",
                    "active-from": "2018-03-01",
                    "production-area": "Finishing",
                    "shift-type": "A/B/C rotating",
                },
            ),
            (
                "OU-MFG-FINSH",
                "Finishing Operations",
                "finishing",
                "department",
                "OU-MFG-CHN",
                {
                    "cost-center-code": "CC-CHN-F",
                    "floor-location": "Plot 12 · Hall 1",
                    "headcount-budget": 40,
                    "active-from": "2018-03-01",
                    "production-area": "Finishing",
                    "shift-type": "A/B/C rotating",
                },
            ),
            (
                "OU-MFG-QA-CHN",
                "Plant Quality",
                "qa-chennai",
                "department",
                "OU-MFG-CHN",
                {
                    "cost-center-code": "CC-CHN-Q",
                    "floor-location": "Plot 12 · Lab",
                    "headcount-budget": 10,
                    "active-from": "2018-03-01",
                    "production-area": "Finishing",
                    "shift-type": "General",
                },
            ),
        ]
        units = {}
        for demo_id, name, key, type_key, parent_demo, custom in specs:
            parent = units[parent_demo] if parent_demo else None
            custom_data = normalize_custom_data(
                company,
                FieldEntity.ORGANIZATION_UNIT,
                custom,
                creating=True,
                existing={},
                permission_codes=codes,
            )
            units[demo_id] = Department.objects.create(
                company=company,
                name=name,
                key=key,
                unit_type=types[type_key],
                parent=parent,
                status=UnitStatus.ACTIVE,
                custom_data=custom_data,
            )
        self.stdout.write(f"Organization units: {len(units)}")
        return units

    def _people(self, company, owner, units):
        codes = {"people.update", "departments.manage"}
        # emp, first, last, email, joined, emp_type, phone, skills, unit, manager_emp, title, extras
        rows = [
            ("EMP-M-001", "Suresh", "Patil", OWNER_EMAIL, "2009-04-01", "Full-time", "9876502101", ["Sales", "Finance"], "OU-MFG-CORP", None, "Managing Director", {}),
            ("EMP-M-002", "Anita", "Kulkarni", "anita.kulkarni@aetherprecision.example", "2010-08-01", "Full-time", "9876502102", ["CNC", "Safety"], "OU-MFG-PUN", "EMP-M-001", "Plant Head — Pune", {"shift": "General", "safety-certification": ["Basic EHS"]}),
            ("EMP-M-003", "Ramesh", "Jadhav", "ramesh.jadhav@aetherprecision.example", "2011-02-15", "Full-time", "9876502103", ["CNC"], "OU-MFG-PROD-P", "EMP-M-002", "Production Manager", {"shift": "General"}),
            ("EMP-M-004", "Deepa", "Sharma", "deepa.sharma@aetherprecision.example", "2012-06-01", "Full-time", "9876502104", ["Quality"], "OU-MFG-QA-C", "EMP-M-001", "Corporate QA Head", {"shift": "General"}),
            ("EMP-M-005", "Imran", "Qureshi", "imran.qureshi@aetherprecision.example", "2013-09-01", "Full-time", "9876502105", ["Sales"], "OU-MFG-CORP", "EMP-M-001", "Sales Manager", {}),
            ("EMP-M-006", "Kavitha", "Srinivasan", "kavitha.srinivasan@aetherprecision.example", "2014-01-10", "Full-time", "9876502106", ["Quality"], "OU-MFG-QA-C", "EMP-M-004", "QA Lead", {"shift": "General"}),
            ("EMP-M-007", "Neha", "Joshi", "neha.joshi@aetherprecision.example", "2015-03-01", "Full-time", "9876502107", ["HR"], "OU-MFG-HR", "EMP-M-001", "HR Manager", {}),
            ("EMP-M-008", "Prakash", "Deshmukh", "prakash.deshmukh@aetherprecision.example", "2015-07-01", "Full-time", "9876502108", ["Finance"], "OU-MFG-FIN", "EMP-M-001", "Finance Manager", {}),
            ("EMP-M-009", "Murugan", "Selvam", "murugan.selvam@aetherprecision.example", "2018-03-01", "Full-time", "9876502109", ["Quality", "Safety"], "OU-MFG-CHN", "EMP-M-001", "Plant Head — Chennai", {"shift": "General", "safety-certification": ["Basic EHS"]}),
            ("EMP-M-010", "Lakshmi", "Narayanan", "lakshmi.narayanan@aetherprecision.example", "2018-04-15", "Full-time", "9876502110", ["HR"], "OU-MFG-HR", "EMP-M-007", "HR Executive", {}),
            ("EMP-M-011", "Ganesh", "Pawar", "ganesh.pawar@aetherprecision.example", "2016-05-01", "Full-time", "9876502111", ["CNC"], "OU-MFG-CNC-A", "EMP-M-003", "Cell Lead — A", {"shift": "Shift A", "machine-qualification": ["VMC", "HMC"]}),
            ("EMP-M-012", "Sunita", "More", "sunita.more@aetherprecision.example", "2017-08-01", "Full-time", "9876502112", ["CNC"], "OU-MFG-CNC-B", "EMP-M-003", "Cell Lead — B", {"shift": "Shift A", "machine-qualification": ["Lathe"]}),
            ("EMP-M-013", "Ajay", "Chavan", "ajay.chavan@aetherprecision.example", "2016-11-01", "Full-time", "9876502113", ["Maintenance"], "OU-MFG-MNT-P", "EMP-M-002", "Maintenance Supervisor", {"shift": "General", "safety-certification": ["Basic EHS", "Electrical L1"]}),
            ("EMP-M-014", "Farhan", "Shaikh", "farhan.shaikh@aetherprecision.example", "2019-02-01", "Full-time", "9876502114", ["Logistics"], "OU-MFG-STO-P", "EMP-M-002", "Stores In-charge", {"shift": "General", "safety-certification": ["Forklift"]}),
            ("EMP-M-015", "Priya", "Rajendran", "priya.rajendran@aetherprecision.example", "2019-06-01", "Full-time", "9876502115", ["Quality"], "OU-MFG-FINSH", "EMP-M-009", "Finishing Supervisor", {"shift": "Shift B"}),
            ("EMP-M-016", "Karthik", "Subramanian", "karthik.subramanian@aetherprecision.example", "2020-01-15", "Full-time", "9876502116", ["Quality"], "OU-MFG-QA-CHN", "EMP-M-009", "Plant Quality Lead", {"shift": "General", "machine-qualification": ["CMM"]}),
            ("EMP-M-017", "Vikas", "Mane", "vikas.mane@aetherprecision.example", "2021-09-01", "Full-time", "9876502117", ["CNC", "Safety"], "OU-MFG-CNC-A", "EMP-M-011", "CNC Operator", {"shift": "Shift B", "safety-certification": ["Basic EHS", "Forklift"], "machine-qualification": ["VMC", "Lathe"]}),
            ("EMP-M-018", "Arun", "Kumar", "arun.kumar@aetherprecision.example", "2024-02-01", "Contract", "9876502118", ["Maintenance"], "OU-MFG-MNT-P", "EMP-M-013", "Maintenance Contractor", {"shift": "Shift A", "safety-certification": ["Basic EHS"]}),
        ]
        people = {}
        # Create without manager refs first, then patch managers.
        for emp, first, last, email, joined, emp_type, phone, skills, unit_demo, _mgr, title, extras in rows:
            custom = {
                "employee-id": emp,
                "date-of-joining": joined,
                "employment-type": emp_type,
                "personal-phone": phone,
                "skills": skills,
                **extras,
            }
            custom_data = normalize_custom_data(
                company, FieldEntity.PERSON, custom, creating=True, existing={}, permission_codes=codes
            )
            if emp == "EMP-M-001":
                membership = CompanyMembership.objects.get(company=company, user=owner)
                person = membership.person
                person.first_name = first
                person.last_name = last
                person.work_email = email
                person.job_title = title
                person.department = units[unit_demo]
                person.status = PersonStatus.ACTIVE
                person.custom_data = custom_data
                person.save()
            else:
                person = Person.objects.create(
                    company=company,
                    first_name=first,
                    last_name=last,
                    work_email=email,
                    job_title=title,
                    department=units[unit_demo],
                    status=PersonStatus.ACTIVE,
                    custom_data=custom_data,
                )
            people[emp] = person

        for row in rows:
            emp, manager_emp = row[0], row[9]
            if not manager_emp:
                continue
            person = people[emp]
            data = dict(person.custom_data or {})
            data["manager"] = str(people[manager_emp].id)
            person.custom_data = normalize_custom_data(
                company,
                FieldEntity.PERSON,
                data,
                creating=False,
                existing=person.custom_data or {},
                permission_codes=codes,
            )
            person.save(update_fields=["custom_data", "updated_at"])

        self.stdout.write(f"People: {len(people)}")
        return people

    def _unit_managers(self, units, people):
        mapping = {
            "OU-MFG-CORP": "EMP-M-001",
            "OU-MFG-PUN": "EMP-M-002",
            "OU-MFG-PROD-P": "EMP-M-003",
            "OU-MFG-QA-C": "EMP-M-006",
            "OU-MFG-HR": "EMP-M-007",
            "OU-MFG-FIN": "EMP-M-008",
            "OU-MFG-CHN": "EMP-M-009",
            "OU-MFG-CNC-A": "EMP-M-011",
            "OU-MFG-CNC-B": "EMP-M-012",
            "OU-MFG-MNT-P": "EMP-M-013",
            "OU-MFG-STO-P": "EMP-M-014",
            "OU-MFG-FINSH": "EMP-M-015",
            "OU-MFG-QA-CHN": "EMP-M-016",
        }
        for unit_demo, emp in mapping.items():
            unit = units[unit_demo]
            unit.manager = people[emp]
            unit.save(update_fields=["manager", "updated_at"])

    def _ensure_user(self, email, first, last, password):
        user = User.objects.filter(email=email).first()
        if user is None:
            return User.objects.create_user(
                email=email,
                password=password,
                first_name=first,
                last_name=last,
                email_verified_at=timezone.now(),
            )
        user.set_password(password)
        user.email_verified_at = user.email_verified_at or timezone.now()
        user.save()
        return user

    def _set_role(self, membership, template_code, assigned_by):
        role = CompanyRole.objects.get(company_id=membership.company_id, template_code=template_code)
        MembershipRoleAssignment.objects.filter(membership=membership).delete()
        MembershipRoleAssignment.objects.create(membership=membership, role=role, assigned_by=assigned_by)

    def _memberships(self, company, owner, people, password):
        codes = {"membership.update", "people.update"}
        # emp -> (template_code, membership custom_data)
        specs = {
            "EMP-M-001": ("owner", {"access-level-note": "Elevated", "desk-seat": "CORP-MD", "preferred-language": "English"}),
            "EMP-M-002": ("department_manager", {"access-level-note": "Elevated", "desk-seat": "PUN-PH-01", "preferred-language": "Other", "internal-notes": "Plant head — Marathi preferred"}),
            "EMP-M-007": ("hr_manager", {"access-level-note": "Elevated", "desk-seat": "CORP-HR-02", "preferred-language": "Hindi"}),
            "EMP-M-009": ("department_manager", {"access-level-note": "Elevated", "desk-seat": "CHN-PH-01", "preferred-language": "English"}),
            "EMP-M-010": (
                "employee",
                {
                    "access-level-note": "Standard",
                    "probation-end-date": "2026-06-30",
                    "desk-seat": "CORP-HR-05",
                    "preferred-language": "English",
                },
            ),
            "EMP-M-017": ("employee", {"access-level-note": "Standard", "desk-seat": "CNC-A-17", "preferred-language": "Hindi"}),
            "EMP-M-018": ("employee", {"access-level-note": "Temporary", "desk-seat": "MNT-C-03", "preferred-language": "English", "internal-notes": "Contractor access"}),
        }
        out = {}
        owner_membership = CompanyMembership.objects.get(company=company, user=owner)
        # Owner already has owner role from bootstrap; set custom_data.
        owner_membership.custom_data = normalize_custom_data(
            company,
            FieldEntity.MEMBERSHIP,
            specs["EMP-M-001"][1],
            creating=True,
            existing={},
            permission_codes=codes,
        )
        owner_membership.save(update_fields=["custom_data", "updated_at"])
        out["EMP-M-001"] = owner_membership

        for emp, (template, custom) in specs.items():
            if emp == "EMP-M-001":
                continue
            person = people[emp]
            user = self._ensure_user(person.work_email, person.first_name, person.last_name, password)
            membership, _ = CompanyMembership.objects.get_or_create(
                company=company,
                user=user,
                defaults={"status": MembershipStatus.ACTIVE, "joined_at": timezone.now(), "person": person},
            )
            membership.status = MembershipStatus.ACTIVE
            membership.person = person
            membership.joined_at = membership.joined_at or timezone.now()
            membership.custom_data = normalize_custom_data(
                company, FieldEntity.MEMBERSHIP, custom, creating=True, existing={}, permission_codes=codes
            )
            membership.save()
            self._set_role(membership, template, owner)
            out[emp] = membership
        self.stdout.write(f"Memberships with roles: {len(out)}")
        return out

    def _invitations(self, company, owner):
        codes = {"membership.invite"}
        specs = [
            (
                "INV-MFG-01",
                "newhire.cnc@aetherprecision.example",
                InvitationStatus.PENDING,
                timezone.now() + timedelta(days=7),
                {
                    "invite-reason": "New hire",
                    "start-date": "2026-11-10",
                    "suggested-role": "Employee",
                    "onboarding-buddy-email": "ganesh.pawar@aetherprecision.example",
                    "welcome-note": "CNC Operator — Cell A",
                },
            ),
            (
                "INV-MFG-02",
                "temp.welder@contractor.example",
                InvitationStatus.PENDING,
                timezone.now() + timedelta(days=7),
                {
                    "invite-reason": "Contractor",
                    "start-date": "2026-10-28",
                    "suggested-role": "Employee",
                    "onboarding-buddy-email": "ajay.chavan@aetherprecision.example",
                    "welcome-note": "6-month maintenance support",
                },
            ),
            (
                "INV-MFG-03",
                "auditor.iatf@partner.example",
                InvitationStatus.PENDING,
                timezone.now() + timedelta(days=14),
                {
                    "invite-reason": "Partner",
                    "start-date": "2026-12-01",
                    "suggested-role": "Employee",
                    "onboarding-buddy-email": "deepa.sharma@aetherprecision.example",
                    "welcome-note": "External IATF auditor access",
                },
            ),
            (
                "INV-MFG-04",
                "old.storekeeper@aetherprecision.example",
                InvitationStatus.REVOKED,
                timezone.now() + timedelta(days=1),
                {
                    "invite-reason": "Other",
                    "start-date": "2026-08-01",
                    "suggested-role": "Employee",
                    "onboarding-buddy-email": "neha.joshi@aetherprecision.example",
                    "welcome-note": "Offer withdrawn",
                },
            ),
            (
                "INV-MFG-05",
                "trainee.qa@aetherprecision.example",
                InvitationStatus.EXPIRED,
                timezone.now() - timedelta(days=30),
                {
                    "invite-reason": "New hire",
                    "start-date": "2025-11-01",
                    "suggested-role": "Employee",
                    "onboarding-buddy-email": "kavitha.srinivasan@aetherprecision.example",
                    "welcome-note": "Internship window lapsed",
                },
            ),
        ]
        out = {}
        for demo_id, email, status, expires, custom in specs:
            token = secrets.token_urlsafe(24)
            custom_data = normalize_custom_data(
                company, FieldEntity.INVITATION, custom, creating=True, existing={}, permission_codes=codes
            )
            inv = MembershipInvitation.objects.create(
                company=company,
                email=email,
                status=status,
                token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
                invited_by=owner,
                expires_at=expires,
                custom_data=custom_data,
            )
            out[demo_id] = {"invitation": inv, "demo_token": token if status == InvitationStatus.PENDING else None}
        self.stdout.write(f"Invitations: {len(out)} (tokens not emailed; demo only)")
        return out

    def _entity(self, company, key, name, description=""):
        return CustomEntity.objects.create(
            company=company, key=key, name=name, description=description, status=FieldStatus.ACTIVE
        )

    def _ef(self, company, entity, name, key, field_type, **kwargs):
        options = kwargs.pop("options", [])
        config = kwargs.pop("config", {})
        is_primary = kwargs.pop("is_primary", False)
        if is_primary:
            CustomEntityField.objects.filter(entity=entity, is_primary=True).update(is_primary=False)
        return CustomEntityField.objects.create(
            company=company,
            entity=entity,
            name=name,
            key=key,
            field_type=field_type,
            options=options,
            config=config,
            required=kwargs.pop("required", False),
            sensitive=kwargs.pop("sensitive", False),
            self_editable=kwargs.pop("self_editable", True),
            filterable=kwargs.pop("filterable", False),
            is_primary=is_primary,
            help_text=kwargs.pop("help_text", ""),
            position=CustomEntityField.objects.filter(entity=entity).count(),
            status=FieldStatus.ACTIVE,
        )

    def _record(self, company, entity, owner, data, permission_codes):
        normalized = normalize_record_data(
            entity, data, creating=True, existing={}, permission_codes=permission_codes
        )
        return CustomEntityRecord.objects.create(
            company=company, entity=entity, data=normalized, created_by=owner, updated_by=owner
        )

    def _custom_entities(self, company, owner, people, units):
        codes = {"custom_entities.manage", "custom_entities.create", "custom_entities.view"}
        out = {}

        # 1. Company assets
        assets = self._entity(company, "company-assets", "Company Assets", "Office and plant devices")
        self._ef(company, assets, "Asset tag", "asset-tag", FieldType.TEXT, required=True, is_primary=True)
        self._ef(company, assets, "Category", "category", FieldType.SELECT, required=True, options=["Laptop", "Phone", "Monitor", "Other"], filterable=True)
        self._ef(company, assets, "Serial number", "serial-number", FieldType.TEXT)
        self._ef(company, assets, "Status", "status", FieldType.SELECT, required=True, options=["In use", "In storage", "Retired"], filterable=True)
        self._ef(company, assets, "Purchase date", "purchase-date", FieldType.DATE)
        self._ef(company, assets, "Assigned employee", "assigned-employee", FieldType.REFERENCE, config={"target": "person", "multiple": False})
        out["company-assets"] = assets
        self._record(company, assets, owner, {"asset-tag": "AST-M-001", "category": "Laptop", "serial-number": "SN-LP-2001", "status": "In use", "purchase-date": "2024-02-10", "assigned-employee": str(people["EMP-M-002"].id)}, codes)
        self._record(company, assets, owner, {"asset-tag": "AST-M-002", "category": "Phone", "serial-number": "SN-PH-2002", "status": "In use", "purchase-date": "2023-05-01", "assigned-employee": str(people["EMP-M-001"].id)}, codes)
        self._record(company, assets, owner, {"asset-tag": "AST-M-003", "category": "Monitor", "serial-number": "SN-MN-2003", "status": "In storage", "purchase-date": "2022-08-01"}, codes)

        # 2. Vendors
        vendors = self._entity(company, "vendors", "Vendors", "Material and tool suppliers")
        self._ef(company, vendors, "Vendor name", "vendor-name", FieldType.TEXT, required=True, is_primary=True)
        self._ef(company, vendors, "Category", "category", FieldType.SELECT, required=True, options=["IT", "Facilities", "Marketing", "Raw material", "Tooling", "Other"], filterable=True)
        self._ef(company, vendors, "Contact email", "contact-email", FieldType.EMAIL)
        self._ef(company, vendors, "Phone", "phone", FieldType.PHONE, config={"validation": {"pattern": "indian_mobile", "min_length": 10, "max_length": 10}})
        self._ef(company, vendors, "Contract end", "contract-end", FieldType.DATE)
        out["vendors"] = vendors
        v_deccan = self._record(company, vendors, owner, {"vendor-name": "Deccan Steels", "category": "Raw material", "contact-email": "sales@deccansteels.example", "phone": "9876502201", "contract-end": "2027-06-30"}, codes)
        v_tool = self._record(company, vendors, owner, {"vendor-name": "ToolCraft India", "category": "Tooling", "contact-email": "orders@toolcraft.example", "phone": "9876502202", "contract-end": "2026-12-31"}, codes)
        self._record(company, vendors, owner, {"vendor-name": "SecureGuard Facilities", "category": "Facilities", "contact-email": "ops@secureguard.example", "phone": "9876502203", "contract-end": "2027-01-15"}, codes)

        # 3. Contracts
        contracts = self._entity(company, "contracts", "Contracts", "Supplier MSAs and leases")
        self._ef(company, contracts, "Contract ID", "contract-id", FieldType.TEXT, required=True, is_primary=True)
        self._ef(company, contracts, "Counterparty", "counterparty", FieldType.TEXT, required=True)
        self._ef(company, contracts, "Type", "type", FieldType.SELECT, required=True, options=["NDA", "MSA", "SOW", "Lease"], filterable=True)
        self._ef(company, contracts, "Expiry date", "expiry-date", FieldType.DATE)
        self._ef(company, contracts, "Value", "value", FieldType.NUMBER)
        self._ef(company, contracts, "Linked vendor", "linked-vendor", FieldType.REFERENCE, config={"target": "custom_entity", "multiple": False, "entity_id": str(vendors.id), "entity_key": vendors.key})
        out["contracts"] = contracts
        self._record(company, contracts, owner, {"contract-id": "CTR-M-100", "counterparty": "Deccan Steels", "type": "MSA", "expiry-date": "2027-06-30", "value": 45000000, "linked-vendor": str(v_deccan.id)}, codes)
        self._record(company, contracts, owner, {"contract-id": "CTR-M-101", "counterparty": "Chakan Shed Lease", "type": "Lease", "expiry-date": "2029-03-31", "value": 12000000}, codes)
        self._record(company, contracts, owner, {"contract-id": "CTR-M-102", "counterparty": "ToolCraft India", "type": "SOW", "expiry-date": "2026-12-31", "value": 2500000, "linked-vendor": str(v_tool.id)}, codes)

        # 4. Office locations
        locations = self._entity(company, "office-locations", "Office Locations", "Plants and offices")
        self._ef(company, locations, "Location code", "location-code", FieldType.TEXT, required=True, is_primary=True)
        self._ef(company, locations, "City", "city", FieldType.TEXT, required=True, filterable=True)
        self._ef(company, locations, "Address", "address", FieldType.LONG_TEXT)
        self._ef(company, locations, "Seats", "seats", FieldType.NUMBER)
        self._ef(company, locations, "Opened on", "opened-on", FieldType.DATE)
        out["office-locations"] = locations
        self._record(company, locations, owner, {"location-code": "LOC-PUN-OFF", "city": "Pune", "address": "Baner Road, Pune", "seats": 30, "opened-on": "2009-04-01"}, codes)
        self._record(company, locations, owner, {"location-code": "LOC-PUN-PLT", "city": "Pune", "address": "Chakan MIDC", "seats": 160, "opened-on": "2010-08-01"}, codes)
        self._record(company, locations, owner, {"location-code": "LOC-CHN-PLT", "city": "Chennai", "address": "SIPCOT Sriperumbudur", "seats": 70, "opened-on": "2018-03-01"}, codes)

        # 5. Production lines
        lines = self._entity(company, "production-lines", "Production Lines", "Line masters linked to org units")
        self._ef(company, lines, "Line code", "line-code", FieldType.TEXT, required=True, is_primary=True)
        self._ef(company, lines, "Title", "title", FieldType.TEXT, required=True)
        self._ef(company, lines, "Status", "status", FieldType.SELECT, required=True, options=["Active", "Downtime", "Decommissioned"], filterable=True)
        self._ef(company, lines, "Org unit", "org-unit", FieldType.REFERENCE, required=True, config={"target": "organization_unit", "multiple": False})
        self._ef(company, lines, "Target OEE %", "target-oee", FieldType.NUMBER, config={"validation": {"min": 0, "max": 100}})
        self._ef(company, lines, "Active from", "active-from", FieldType.DATE)
        out["production-lines"] = lines
        line_a = self._record(company, lines, owner, {"line-code": "LINE-A", "title": "CNC Cell A", "status": "Active", "org-unit": str(units["OU-MFG-CNC-A"].id), "target-oee": 82, "active-from": "2014-05-01"}, codes)
        line_b = self._record(company, lines, owner, {"line-code": "LINE-B", "title": "CNC Cell B", "status": "Active", "org-unit": str(units["OU-MFG-CNC-B"].id), "target-oee": 80, "active-from": "2016-09-01"}, codes)
        self._record(company, lines, owner, {"line-code": "LINE-F", "title": "Finishing Hall", "status": "Active", "org-unit": str(units["OU-MFG-FINSH"].id), "target-oee": 75, "active-from": "2018-03-01"}, codes)

        # 6. Machines
        machines = self._entity(company, "machines-and-equipment", "Machines and Equipment", "Shop-floor CNC and metrology")
        self._ef(company, machines, "Machine code", "machine-code", FieldType.TEXT, required=True, is_primary=True)
        self._ef(company, machines, "Name", "name", FieldType.TEXT, required=True)
        self._ef(company, machines, "Category", "category", FieldType.SELECT, required=True, options=["VMC", "HMC", "Lathe", "Grinder", "CMM", "Other"], filterable=True)
        self._ef(company, machines, "Maintenance status", "maintenance-status", FieldType.SELECT, required=True, options=["OK", "Due", "Overdue", "Under repair"], filterable=True)
        self._ef(company, machines, "Last inspection date", "last-inspection-date", FieldType.DATE)
        self._ef(company, machines, "Production line", "production-line", FieldType.REFERENCE, config={"target": "custom_entity", "multiple": False, "entity_id": str(lines.id), "entity_key": lines.key})
        self._ef(company, machines, "Responsible technician", "responsible-technician", FieldType.REFERENCE, config={"target": "person", "multiple": False})
        out["machines-and-equipment"] = machines
        m_vmc = self._record(company, machines, owner, {"machine-code": "MCH-VMC-01", "name": "VMC Bay A1", "category": "VMC", "maintenance-status": "OK", "last-inspection-date": "2026-09-15", "production-line": str(line_a.id), "responsible-technician": str(people["EMP-M-013"].id)}, codes)
        m_lat = self._record(company, machines, owner, {"machine-code": "MCH-LAT-04", "name": "Lathe Bay B2", "category": "Lathe", "maintenance-status": "Due", "last-inspection-date": "2026-08-01", "production-line": str(line_b.id), "responsible-technician": str(people["EMP-M-013"].id)}, codes)
        self._record(company, machines, owner, {"machine-code": "MCH-CMM-01", "name": "CMM Lab", "category": "CMM", "maintenance-status": "OK", "last-inspection-date": "2026-09-01", "responsible-technician": str(people["EMP-M-016"].id)}, codes)

        # 7. Quality inspections
        qi = self._entity(company, "quality-inspections", "Quality Inspections", "Sample QC events")
        self._ef(company, qi, "Inspection ID", "inspection-id", FieldType.TEXT, required=True, is_primary=True)
        self._ef(company, qi, "Lot / batch", "lot-batch", FieldType.TEXT, required=True)
        self._ef(company, qi, "Result", "result", FieldType.SELECT, required=True, options=["Pass", "Fail", "Conditional"], filterable=True)
        self._ef(company, qi, "Inspected on", "inspected-on", FieldType.DATE, required=True)
        self._ef(company, qi, "Inspector", "inspector", FieldType.REFERENCE, config={"target": "person", "multiple": False})
        self._ef(company, qi, "Machine", "machine", FieldType.REFERENCE, config={"target": "custom_entity", "multiple": False, "entity_id": str(machines.id), "entity_key": machines.key})
        self._ef(company, qi, "Notes", "notes", FieldType.LONG_TEXT)
        out["quality-inspections"] = qi
        self._record(company, qi, owner, {"inspection-id": "QI-2026-001", "lot-batch": "LOT-A-100", "result": "Pass", "inspected-on": "2026-09-16", "inspector": str(people["EMP-M-006"].id), "machine": str(m_vmc.id)}, codes)
        self._record(company, qi, owner, {"inspection-id": "QI-2026-002", "lot-batch": "LOT-B-44", "result": "Fail", "inspected-on": "2026-09-20", "inspector": str(people["EMP-M-016"].id), "machine": str(m_lat.id), "notes": "Dimensional drift on OD"}, codes)
        self._record(company, qi, owner, {"inspection-id": "QI-2026-003", "lot-batch": "LOT-A-101", "result": "Conditional", "inspected-on": "2026-09-22", "inspector": str(people["EMP-M-006"].id), "machine": str(m_vmc.id)}, codes)

        # 8. Supplier deliveries
        deliveries = self._entity(company, "supplier-deliveries", "Supplier Deliveries", "Inbound lots")
        self._ef(company, deliveries, "Delivery ID", "delivery-id", FieldType.TEXT, required=True, is_primary=True)
        self._ef(company, deliveries, "Vendor", "vendor", FieldType.REFERENCE, required=True, config={"target": "custom_entity", "multiple": False, "entity_id": str(vendors.id), "entity_key": vendors.key})
        self._ef(company, deliveries, "Material", "material", FieldType.TEXT, required=True)
        self._ef(company, deliveries, "Quantity kg", "quantity-kg", FieldType.NUMBER, required=True)
        self._ef(company, deliveries, "Delivered on", "delivered-on", FieldType.DATE, required=True)
        self._ef(company, deliveries, "Receiving plant", "receiving-plant", FieldType.REFERENCE, config={"target": "organization_unit", "multiple": False})
        self._ef(company, deliveries, "QC status", "qc-status", FieldType.SELECT, required=True, options=["Pending", "Accepted", "Rejected"], filterable=True)
        out["supplier-deliveries"] = deliveries
        self._record(company, deliveries, owner, {"delivery-id": "DLV-9001", "vendor": str(v_deccan.id), "material": "EN8 bar", "quantity-kg": 12000, "delivered-on": "2026-10-01", "receiving-plant": str(units["OU-MFG-PUN"].id), "qc-status": "Accepted"}, codes)
        self._record(company, deliveries, owner, {"delivery-id": "DLV-9002", "vendor": str(v_tool.id), "material": "Carbide inserts", "quantity-kg": 45, "delivered-on": "2026-10-05", "receiving-plant": str(units["OU-MFG-PUN"].id), "qc-status": "Pending"}, codes)

        self.stdout.write(f"Custom entities: {len(out)}")
        return out

    def _isolation_company(self, password):
        """Minimal second tenant for cross-company isolation checks."""
        email = "owner@isolation.example"
        user = self._ensure_user(email, "Iso", "Owner", password)
        company = Company.objects.create(
            slug=ISOLATION_SLUG,
            legal_name="Demo Isolation Co",
            display_name="Demo Isolation Co",
            status=CompanyStatus.ACTIVE,
            created_by=user,
        )
        CompanyMembership.objects.create(
            company=company, user=user, status=MembershipStatus.ACTIVE, joined_at=timezone.now()
        )
        bootstrap_company_access(company, user)
        plan = BillingPlan.objects.get(code="growth")
        price = BillingPlanPrice.objects.filter(plan=plan, billing_interval="year", currency="INR").first()
        Subscription.objects.create(
            company=company,
            plan=plan,
            plan_price=price,
            billing_interval="year",
            currency="INR",
            status=SubscriptionStatus.TRIALING,
            provider="pulse",
        )
        # One decoy machine entity so list endpoints work, but must not see Aether data.
        decoy = CustomEntity.objects.create(company=company, key="machines-and-equipment", name="Machines and Equipment")
        CustomEntityField.objects.create(
            company=company,
            entity=decoy,
            name="Machine code",
            key="machine-code",
            field_type=FieldType.TEXT,
            required=True,
            is_primary=True,
            status=FieldStatus.ACTIVE,
        )
        return {"company": company, "owner": user, "entity": decoy}

    def _print_id_map(self, ctx):
        self.stdout.write("--- Demo ID → UUID map (sample) ---")
        self.stdout.write(f"CO-MFG-001 → {ctx['company'].id}")
        for emp, person in list(ctx["people"].items())[:5]:
            self.stdout.write(f"{emp} → {person.id}")
        self.stdout.write(f"... ({len(ctx['people'])} people total)")
        for demo, unit in list(ctx["units"].items())[:5]:
            self.stdout.write(f"{demo} → {unit.id}")
        self.stdout.write(f"... ({len(ctx['units'])} units total)")
        for key, entity in ctx["entities"].items():
            self.stdout.write(f"entity:{key} → {entity.id}")

    def _verify(self, ctx, password):
        self.stdout.write("--- §J verification ---")
        company = ctx["company"]
        owner = ctx["owner"]
        membership = CompanyMembership.objects.get(company=company, user=owner)
        codes = effective_permission_codes(membership)
        factory = RequestFactory()

        # Person shift is filterable in schema; people list API does not yet accept filter.* —
        # verify stored values via ORM (custom entity filters exercise list_records below).
        shift_b = Person.objects.filter(company=company, custom_data__shift="Shift B")
        self.stdout.write(
            self.style.SUCCESS(
                f"People custom_data shift=Shift B → {shift_b.count()} "
                f"({', '.join(f'{p.first_name} {p.last_name}' for p in shift_b)})"
            )
        )
        if shift_b.count() < 1:
            raise CommandError("Expected at least one Shift B person")

        def _drf_get(params):
            django_req = factory.get("/", params)
            django_req.user = owner
            return Request(django_req)

        machines = ctx["entities"]["machines-and-equipment"]
        due_payload = list_records(_drf_get({"filter.maintenance-status": "Due"}), company, machines.id, permission_codes=codes)
        due_rows = due_payload.get("results", [])
        self.stdout.write(self.style.SUCCESS(f"Filter machines maintenance-status=Due → {len(due_rows)} (expect 1)"))
        if len(due_rows) != 1:
            raise CommandError(f"Expected 1 Due machine, got {len(due_rows)}")

        qi = ctx["entities"]["quality-inspections"]
        fail_payload = list_records(_drf_get({"filter.result": "Fail"}), company, qi.id, permission_codes=codes)
        fail_rows = fail_payload.get("results", [])
        self.stdout.write(self.style.SUCCESS(f"Filter quality-inspections result=Fail → {len(fail_rows)} (expect 1)"))
        if len(fail_rows) != 1:
            raise CommandError(f"Expected 1 Fail inspection, got {len(fail_rows)}")

        # Cross-company isolation (ORM + scoped list_records)
        iso = ctx["isolation"]
        aether_people_visible = Person.objects.filter(company=iso["company"]).filter(
            work_email__endswith="@aetherprecision.example"
        ).count()
        if aether_people_visible:
            raise CommandError("Isolation leak: Aether emails visible under isolation company queryset")
        self.stdout.write(self.style.SUCCESS("Isolation: Aether people absent from isolation company queryset"))

        foreign_people = Person.objects.filter(company=company).count()
        other_people = Person.objects.filter(company=iso["company"]).count()
        if foreign_people < 18:
            raise CommandError(f"Expected ≥18 Aether people, got {foreign_people}")
        self.stdout.write(
            self.style.SUCCESS(f"Isolation: Aether people={foreign_people}, isolation people={other_people}")
        )

        # Foreign entity id must not resolve under isolation company
        from common.api.exceptions import PulseAPIException

        try:
            list_records(_drf_get({}), iso["company"], machines.id, permission_codes={"custom_entities.view"})
            raise CommandError("Expected not_found when listing Aether entity under isolation company")
        except PulseAPIException as exc:
            if exc.status_code != 404 or getattr(exc, "pulse_code", None) != "not_found":
                raise CommandError(f"Unexpected cross-entity error: {exc.status_code} {getattr(exc, 'pulse_code', exc)}") from exc
            self.stdout.write(self.style.SUCCESS("Isolation: foreign entity under other company → not_found"))

        aether_machine_records = CustomEntityRecord.objects.filter(company=company, entity=machines).count()
        iso_machine_records = CustomEntityRecord.objects.filter(company=iso["company"], entity=iso["entity"]).count()
        if aether_machine_records < 1 or iso_machine_records != 0:
            raise CommandError(
                f"Record isolation unexpected: aether={aether_machine_records} iso={iso_machine_records}"
            )
        self.stdout.write(
            self.style.SUCCESS(
                f"Isolation: Aether machine records={aether_machine_records}, isolation records={iso_machine_records}"
            )
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Counts: people={Person.objects.filter(company=company).count()} "
                f"units={Department.objects.filter(company=company).count()} "
                f"invites={MembershipInvitation.objects.filter(company=company).count()} "
                f"entities={CustomEntity.objects.filter(company=company).count()} "
                f"records={CustomEntityRecord.objects.filter(company=company).count()}"
            )
        )
