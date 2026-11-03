from __future__ import annotations

import collections
import datetime
import hashlib
import secrets
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.authorization.company import bootstrap_company_access, ensure_company_catalog
from apps.authorization.models import CompanyRole, MembershipRoleAssignment
from apps.authorization.services import ensure_platform_catalog
from apps.billing.models import (
    BillingPlan,
    BillingPlanEntitlement,
    BillingPlanPrice,
    Subscription,
    SubscriptionStatus,
)
from apps.identity.models import User
from apps.modules_registry.manifests import MODULES
from apps.modules_registry.models import ModuleDefinition
from apps.modules_registry.services import ensure_module_catalog, install_module
from apps.organization.models import Department, OrganizationUnitType, Person, PersonStatus, UnitStatus
from apps.parties.models import Party, PartyKind
from apps.tenants.models import (
    Company,
    CompanyBillingProfile,
    CompanyMembership,
    CompanyStatus,
    CustomEntity,
    CustomEntityField,
    CustomEntityRecord,
    CustomField,
    FieldEntity,
    FieldStatus,
    FieldType,
    LegalEntity,
    MembershipInvitation,
    MembershipStatus,
    OnboardingState,
)

# HRMS
import apps.hrms.models as hm

# Projects
import apps.projects.models as pm

# CRM
import apps.crm.models as crm_m

# Commerce
import apps.commerce.models as comm_m


class StatsCollector:
    def __init__(self):
        self.inserted = collections.defaultdict(int)
        self.updated = collections.defaultdict(int)
        self.skipped = collections.defaultdict(int)
        self.validated = collections.defaultdict(int)

    def record(self, entity_name: str, created: bool):
        if created:
            self.inserted[entity_name] += 1
        else:
            self.updated[entity_name] += 1

    def skip(self, entity_name: str):
        self.skipped[entity_name] += 1

    def validate(self, entity_name: str, count: int = 1):
        self.validated[entity_name] += count

    def summary(self) -> dict:
        entities = sorted(set(list(self.inserted.keys()) + list(self.updated.keys()) + list(self.skipped.keys()) + list(self.validated.keys())))
        rows = []
        for e in entities:
            rows.append({
                "entity": e,
                "inserted": self.inserted[e],
                "updated": self.updated[e],
                "skipped": self.skipped[e],
                "validated": self.validated[e],
            })
        return rows


def ensure_base_catalogs(stats: StatsCollector) -> None:
    ensure_platform_catalog()
    ensure_company_catalog()
    ensure_module_catalog()

    plans_config = [
        {
            "code": "growth",
            "name": "Growth",
            "desc": "Growing organizations with full module access.",
            "max_people": 50,
            "prices": [("month", 999900), ("year", 9999900)],
            "modules": ["hrms", "projects", "crm", "commerce"],
        },
        {
            "code": "enterprise",
            "name": "Enterprise",
            "desc": "Enterprise organizations with high-capacity limits.",
            "max_people": 250,
            "prices": [("month", 2499900), ("year", 24999900)],
            "modules": ["hrms", "projects", "crm", "commerce"],
        },
    ]

    effective_from = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)

    for p in plans_config:
        plan, created = BillingPlan.objects.get_or_create(
            code=p["code"],
            defaults={
                "name": p["name"],
                "description": p["desc"],
                "is_active": True,
                "is_public": True,
                "trial_days": 14,
            },
        )
        stats.record("BillingPlan", created)

        for interval, amount in p["prices"]:
            _, pr_created = BillingPlanPrice.objects.get_or_create(
                plan=plan,
                billing_interval=interval,
                currency="INR",
                effective_from=effective_from,
                defaults={"amount_minor": amount, "is_active": True},
            )
            stats.record("BillingPlanPrice", pr_created)

        for key, value in [
            ("max_people", p["max_people"]),
            ("dashboards_enabled", True),
            ("included_module_slugs", p["modules"]),
        ]:
            _, ent_created = BillingPlanEntitlement.objects.update_or_create(
                plan=plan,
                entitlement_key=key,
                defaults={"entitlement_value": value},
            )
            stats.record("BillingPlanEntitlement", ent_created)


def seed_owner_user(email: str, first_name: str, last_name: str, password: str, stats: StatsCollector) -> User:
    now = timezone.now()
    user, created = User.objects.get_or_create(
        email=email,
        defaults={
            "first_name": first_name,
            "last_name": last_name,
            "is_active": True,
            "email_verified_at": now,
        },
    )
    user.set_password(password)
    user.first_name = first_name
    user.last_name = last_name
    user.is_active = True
    user.email_verified_at = user.email_verified_at or now
    user.save()
    stats.record("User", created)
    return user


def seed_company(spec: dict, owner_user: User, stats: StatsCollector) -> Company:
    now = timezone.now()
    company, created = Company.objects.get_or_create(
        slug=spec["slug"],
        defaults={
            "display_name": spec["display_name"],
            "legal_name": spec.get("legal_name", spec["display_name"]),
            "status": CompanyStatus.ACTIVE,
            "country_code": "IN",
            "timezone": "Asia/Kolkata",
            "created_by": owner_user,
        },
    )
    if not created:
        company.display_name = spec["display_name"]
        company.legal_name = spec.get("legal_name", spec["display_name"])
        company.status = CompanyStatus.ACTIVE
        company.save(update_fields=["display_name", "legal_name", "status"])
    stats.record("Company", created)

    # Ensure owner membership and access
    mem, m_created = CompanyMembership.objects.get_or_create(
        company=company,
        user=owner_user,
        defaults={"status": MembershipStatus.ACTIVE, "joined_at": now},
    )
    stats.record("CompanyMembership", m_created)

    bootstrap_company_access(company, owner_user)

    # Onboarding State
    _, ob_created = OnboardingState.objects.get_or_create(
        company=company,
        defaults={
            "owner": owner_user,
            "email_verified_at": owner_user.email_verified_at or now,
            "company_created_at": now,
            "profile_completed_at": now,
            "billing_profile_completed_at": now,
            "plan_selected_at": now,
            "subscription_activated_at": now,
            "workspace_entered_at": now,
        },
    )
    stats.record("OnboardingState", ob_created)

    # Billing Profile
    b_spec = spec.get("billing_profile", {})
    if b_spec:
        _, bp_created = CompanyBillingProfile.objects.update_or_create(
            company=company,
            defaults={
                "billing_name": b_spec.get("legal_name", company.display_name),
                "billing_email": b_spec.get("billing_email", f"billing@{company.slug}.example"),
                "country_code": b_spec.get("country_code", "IN"),
                "gstin": b_spec.get("tax_id", ""),
                "address_line1": b_spec.get("address_line1", ""),
                "city": b_spec.get("city", ""),
                "state_code": b_spec.get("state_code", "KA"),
                "postal_code": b_spec.get("postal_code", ""),
            },
        )
        stats.record("CompanyBillingProfile", bp_created)

    # Subscription
    plan_code = spec.get("plan_code", "growth")
    plan = BillingPlan.objects.get(code=plan_code)
    price = (
        BillingPlanPrice.objects.filter(plan=plan, billing_interval=spec.get("billing_interval", "month"), currency="INR")
        .order_by("-effective_from")
        .first()
    )
    if price:
        _, sub_created = Subscription.objects.update_or_create(
            company=company,
            defaults={
                "plan": plan,
                "plan_price": price,
                "status": SubscriptionStatus.ACTIVE,
                "current_period_start": now - datetime.timedelta(days=30),
                "current_period_end": now + datetime.timedelta(days=335),
            },
        )
        stats.record("Subscription", sub_created)

    return company


def seed_custom_fields(company: Company, fields_spec: list[dict], stats: StatsCollector) -> None:
    for f in fields_spec:
        _, created = CustomField.objects.update_or_create(
            company=company,
            entity=f["entity"],
            key=f["key"],
            defaults={
                "name": f["label"],
                "field_type": f["field_type"],
                "required": f.get("required", False),
                "filterable": f.get("filterable", False),
                "sensitive": f.get("sensitive", False),
                "self_editable": f.get("self_editable", True),
                "position": f.get("position", 0),
                "status": FieldStatus.ACTIVE,
                "options": f.get("options", []),
                "config": f.get("config", {}),
            },
        )
        stats.record("CustomField", created)


def seed_unit_types_and_departments(company: Company, types_spec: list[dict], units_spec: list[dict], stats: StatsCollector) -> dict[str, Department]:
    types_map = {}
    for t in types_spec:
        sing = t.get("singular_label", t.get("name", t["key"].capitalize()))
        plur = t.get("plural_label", f"{sing}s")
        obj, created = OrganizationUnitType.objects.update_or_create(
            company=company,
            key=t["key"],
            defaults={
                "singular_label": sing,
                "plural_label": plur,
                "position": t.get("position", t.get("level", 1)),
                "description": t.get("description", ""),
                "is_active": True,
            },
        )
        types_map[t["key"]] = obj
        stats.record("OrganizationUnitType", created)

    departments_map = {}
    # First pass: create/update departments
    for u in units_spec:
        u_type = types_map.get(u.get("unit_type_key"))
        dept, created = Department.objects.get_or_create(
            company=company,
            key=u["code"],
            defaults={
                "name": u["name"],
                "unit_type": u_type,
                "status": UnitStatus.ACTIVE,
                "custom_data": u.get("custom_data", {}),
            },
        )
        if not created:
            dept.name = u["name"]
            dept.unit_type = u_type
            dept.custom_data = u.get("custom_data", {})
            dept.save(update_fields=["name", "unit_type", "custom_data"])
        departments_map[u["code"]] = dept
        stats.record("Department", created)

    # Second pass: connect parents
    for u in units_spec:
        parent_code = u.get("parent_code")
        if parent_code and parent_code in departments_map:
            dept = departments_map[u["code"]]
            parent_dept = departments_map[parent_code]
            if dept.parent_id != parent_dept.id:
                dept.parent = parent_dept
                dept.save(update_fields=["parent"])

    return departments_map


def seed_people(company: Company, owner_user: User, people_spec: list[dict], departments_map: dict[str, Department], stats: StatsCollector) -> dict[str, Person]:
    people_map = {}
    owner_membership = CompanyMembership.objects.filter(company=company, user=owner_user).first()
    owner_person = owner_membership.person if owner_membership else None

    for idx, p in enumerate(people_spec):
        dept = departments_map.get(p.get("department_code"))
        # First person is company owner
        if idx == 0 and owner_person is not None:
            owner_person.first_name = p["first_name"]
            owner_person.last_name = p["last_name"]
            owner_person.work_email = p["work_email"]
            owner_person.job_title = p.get("job_title", "")
            owner_person.department = dept
            owner_person.status = PersonStatus.ACTIVE
            owner_person.custom_data = p.get("custom_data", {})
            owner_person.save()
            people_map[p["code"]] = owner_person
            stats.record("Person", False)
            continue

        person, created = Person.objects.update_or_create(
            company=company,
            work_email=p["work_email"],
            defaults={
                "first_name": p["first_name"],
                "last_name": p["last_name"],
                "job_title": p.get("job_title", ""),
                "department": dept,
                "status": PersonStatus.ACTIVE,
                "custom_data": p.get("custom_data", {}),
            },
        )
        people_map[p["code"]] = person
        stats.record("Person", created)

    # Update unit managers
    for u_code, dept in departments_map.items():
        mgr_code = None
        for p in people_spec:
            if p.get("manages_unit_code") == u_code:
                mgr_code = p["code"]
                break
        if mgr_code and mgr_code in people_map:
            dept.manager = people_map[mgr_code]
            dept.save(update_fields=["manager"])

    return people_map


def seed_users_and_memberships(company: Company, owner_user: User, users_spec: list[dict], people_map: dict[str, Person], password: str, stats: StatsCollector) -> dict[str, CompanyMembership]:
    memberships_map = {}
    now = timezone.now()

    for u in users_spec:
        email = u["email"]
        if email == owner_user.email:
            mem = CompanyMembership.objects.filter(company=company, user=owner_user).first()
            if mem:
                person = people_map.get(u.get("person_code"))
                if person and mem.person_id != person.id:
                    mem.person = person
                    mem.save(update_fields=["person"])
                memberships_map[email] = mem
            continue

        first = u.get("first_name", u.get("name", "").split(" ")[0] if " " in u.get("name", "") else u.get("name", ""))
        last = u.get("last_name", u.get("name", "").split(" ")[-1] if " " in u.get("name", "") else "")
        user, u_created = User.objects.get_or_create(
            email=email,
            defaults={
                "first_name": first,
                "last_name": last,
                "is_active": True,
                "email_verified_at": now,
            },
        )
        user.set_password(password)
        user.first_name = first
        user.last_name = last
        user.is_active = True
        user.email_verified_at = user.email_verified_at or now
        user.save()
        stats.record("User", u_created)

        person = people_map.get(u.get("person_code"))
        mem, m_created = CompanyMembership.objects.update_or_create(
            company=company,
            user=user,
            defaults={
                "person": person,
                "status": MembershipStatus.ACTIVE,
                "joined_at": now,
                "custom_data": u.get("custom_data", {}),
            },
        )
        memberships_map[email] = mem
        stats.record("CompanyMembership", m_created)

        # Assign Role
        role_slug = u.get("role_slug", "employee")
        role = CompanyRole.objects.filter(company=company, template_code=role_slug).first()
        if role:
            _, ra_created = MembershipRoleAssignment.objects.get_or_create(
                membership=mem,
                role=role,
                defaults={"assigned_by": owner_user},
            )
            stats.record("MembershipRoleAssignment", ra_created)

    return memberships_map


def seed_invitations(company: Company, owner_user: User, invitations_spec: list[dict], stats: StatsCollector) -> None:
    for inv in invitations_spec:
        token_hash = hashlib.sha256(secrets.token_bytes(32)).hexdigest()
        _, created = MembershipInvitation.objects.update_or_create(
            company=company,
            email=inv["email"],
            defaults={
                "status": inv.get("status", "pending"),
                "invited_by": owner_user,
                "token_hash": token_hash,
                "expires_at": timezone.now() + datetime.timedelta(days=14),
                "custom_data": inv.get("custom_data", {}),
            },
        )
        stats.record("MembershipInvitation", created)


def seed_custom_entities(company: Company, owner_user: User, entities_spec: list[dict], records_spec: list[dict], people_map: dict[str, Person], departments_map: dict[str, Department], stats: StatsCollector) -> None:
    entity_objs = {}
    for e in entities_spec:
        ent, created = CustomEntity.objects.update_or_create(
            company=company,
            key=e["slug"],
            defaults={
                "name": e["name"],
                "description": e.get("description", ""),
                "status": "active",
            },
        )
        entity_objs[e["slug"]] = ent
        stats.record("CustomEntity", created)

        for f in e.get("fields", []):
            _, f_created = CustomEntityField.objects.update_or_create(
                entity=ent,
                key=f["key"],
                defaults={
                    "company": company,
                    "name": f["label"],
                    "field_type": f["field_type"],
                    "required": f.get("required", False),
                    "is_primary": f.get("is_primary", False),
                    "options": f.get("options", []),
                    "config": f.get("config", {}),
                },
            )
            stats.record("CustomEntityField", f_created)

    for r in records_spec:
        ent = entity_objs.get(r["entity_slug"])
        if not ent:
            continue
        data = dict(r["data"])
        # Resolve references
        for k, v in list(data.items()):
            if isinstance(v, str) and v.startswith("EMP-") and v in people_map:
                data[k] = [str(people_map[v].id)]
            elif isinstance(v, str) and v.startswith("OU-") and v in departments_map:
                data[k] = [str(departments_map[v].id)]

        # CustomEntityRecord matching by primary key data
        primary_field = ent.fields.filter(is_primary=True).first()
        rec = None
        if primary_field and primary_field.key in data:
            val = data[primary_field.key]
            for candidate in CustomEntityRecord.objects.filter(company=company, entity=ent):
                if candidate.data.get(primary_field.key) == val:
                    rec = candidate
                    break

        if rec is None:
            rec = CustomEntityRecord.objects.create(
                company=company,
                entity=ent,
                data=data,
                created_by=owner_user,
                updated_by=owner_user,
            )
            stats.record("CustomEntityRecord", True)
        else:
            rec.data = data
            rec.updated_by = owner_user
            rec.save(update_fields=["data", "updated_by", "updated_at"])
            stats.record("CustomEntityRecord", False)


def seed_parties(company: Company, parties_spec: list[dict], stats: StatsCollector) -> dict[str, Party]:
    parties_map = {}
    for p in parties_spec:
        party, created = Party.objects.update_or_create(
            company=company,
            display_name=p["name"],
            defaults={
                "kind": p.get("kind", PartyKind.ORGANIZATION),
                "status": "active",
            },
        )
        parties_map[p["name"]] = party
        stats.record("Party", created)
    return parties_map


def install_company_modules(company: Company, owner_user: User, module_slugs: list[str], stats: StatsCollector) -> None:
    for slug in module_slugs:
        try:
            res = install_module(
                user=owner_user,
                company=company,
                slug=slug,
                enforce_permission=False,
            )
            stats.record("CompanyModuleInstallation", True if res.get("status") == "installed" else False)
        except Exception:
            from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus
            inst = CompanyModuleInstallation.objects.filter(company=company, module_id=slug, status=InstallationStatus.INSTALLED).first()
            if inst:
                stats.record("CompanyModuleInstallation", False)
            else:
                raise


def seed_hrms(company: Company, owner_user: User, hrms_spec: dict, people_map: dict[str, Person], departments_map: dict[str, Department], stats: StatsCollector) -> None:
    # 1. LegalEntity
    le_spec = hrms_spec.get("legal_entity", {})
    le = None
    if le_spec:
        le, created = LegalEntity.objects.update_or_create(
            company=company,
            code=le_spec["code"],
            defaults={
                "name": le_spec["name"],
                "country_code": le_spec.get("country_code", "IN"),
                "status": "active",
                "created_by": owner_user,
            },
        )
        stats.record("LegalEntity", created)

    # 2. WorkLocations
    loc_map = {}
    for loc in hrms_spec.get("work_locations", []):
        raw_addr = loc.get("address", "")
        if isinstance(raw_addr, dict):
            addr_str = f"{raw_addr.get('city', '')}, {raw_addr.get('state', '')}"
        else:
            addr_str = str(raw_addr)
        obj, created = hm.WorkLocation.objects.update_or_create(
            company=company,
            code=loc["code"],
            defaults={
                "name": loc["name"],
                "address": addr_str,
                "timezone": loc.get("timezone", "Asia/Kolkata"),
                "status": "active",
            },
        )
        loc_map[loc["code"]] = obj
        stats.record("WorkLocation", created)

    # 3. Designations
    des_map = {}
    for des in hrms_spec.get("designations", []):
        obj, created = hm.Designation.objects.update_or_create(
            company=company,
            code=des["code"],
            defaults={
                "name": des["name"],
                "description": des.get("description", ""),
                "is_active": True,
            },
        )
        des_map[des["code"]] = obj
        stats.record("Designation", created)

    # 4. Shifts & Schedules
    shift_map = {}
    for s in hrms_spec.get("shifts", []):
        obj, created = hm.Shift.objects.update_or_create(
            company=company,
            code=s["code"],
            defaults={
                "name": s["name"],
                "starts_at": s["starts_at"],
                "ends_at": s["ends_at"],
                "grace_minutes": s.get("grace_minutes", 15),
                "status": "active",
            },
        )
        shift_map[s["code"]] = obj
        stats.record("Shift", created)

    for sch in hrms_spec.get("work_schedules", []):
        _, created = hm.WorkSchedule.objects.update_or_create(
            company=company,
            name=sch["name"],
            defaults={
                "weekdays": sch.get("weekdays", [0, 1, 2, 3, 4]),
                "status": "active",
            },
        )
        stats.record("WorkSchedule", created)

    # 5. Attendance Policy
    for pol in hrms_spec.get("attendance_policies", []):
        _, created = hm.AttendancePolicy.objects.update_or_create(
            company=company,
            name=pol["name"],
            defaults={
                "allowed_methods": pol.get("allowed_methods", ["web", "mobile", "biometric"]),
                "fallback_methods": pol.get("fallback_methods", ["manual"]),
                "status": "active",
                "starts_on": datetime.date(2026, 1, 1),
            },
        )
        stats.record("AttendancePolicy", created)

    # 6. Employments
    emp_map = {}
    for e in hrms_spec.get("employments", []):
        person = people_map.get(e["person_code"])
        if not person:
            continue
        emp, created = hm.Employment.objects.update_or_create(
            company=company,
            person=person,
            defaults={
                "legal_entity": le,
                "employee_number": e.get("employee_number", e["person_code"]),
                "employment_type": e.get("employment_type", "full_time"),
                "job_title": person.job_title,
                "status": e.get("status", "active"),
                "starts_on": e.get("starts_on", datetime.date(2026, 1, 1)),
                "ends_on": e.get("ends_on"),
                "created_by": owner_user,
            },
        )
        emp_map[e["person_code"]] = emp
        stats.record("Employment", created)

    # 7. Attendance Sessions & Events
    default_shift = list(shift_map.values())[0] if shift_map else None
    for att in hrms_spec.get("attendance_sessions", []):
        emp = emp_map.get(att["person_code"])
        if not emp:
            continue
        shift = shift_map.get(att.get("shift_code"), default_shift)
        work_dt = att.get("work_date", datetime.date(2026, 10, 20))
        sess, created = hm.AttendanceSession.objects.update_or_create(
            company=company,
            employment=emp,
            work_date=work_dt,
            sequence=1,
            defaults={
                "shift": shift,
                "status": att.get("status", "complete"),
                "timezone_name": "Asia/Kolkata",
                "minutes_worked": att.get("minutes_worked", 480),
            },
        )
        stats.record("AttendanceSession", created)

    # 8. Leave Policies, Balances, Requests
    lp_map = {}
    for lp in hrms_spec.get("leave_policies", []):
        obj, created = hm.LeavePolicy.objects.update_or_create(
            company=company,
            name=lp["name"],
            defaults={"days_per_year": lp.get("days_per_year", 12)},
        )
        lp_map[lp["name"]] = obj
        stats.record("LeavePolicy", created)

    year = 2026
    for emp_code, emp in emp_map.items():
        for pol_name, pol in lp_map.items():
            _, b_created = hm.LeaveBalance.objects.update_or_create(
                company=company,
                person=emp.person,
                policy=pol,
                year=year,
                defaults={"allocated_days": pol.days_per_year, "used_days": 1},
            )
            stats.record("LeaveBalance", b_created)

    for req in hrms_spec.get("leave_requests", []):
        emp = emp_map.get(req["person_code"])
        pol = lp_map.get(req["policy_name"])
        if not emp or not pol:
            continue
        _, r_created = hm.LeaveRequest.objects.update_or_create(
            company=company,
            person=emp.person,
            policy=pol,
            starts_on=req["starts_on"],
            defaults={
                "ends_on": req["ends_on"],
                "reason": req.get("reason", "Personal leave"),
                "status": req.get("status", "approved"),
                "decided_by": owner_user,
            },
        )
        stats.record("LeaveRequest", r_created)

    # 9. Salary Structure & Compensation
    struct_name = hrms_spec.get("salary_structure_name", "Standard Corporate Structure")
    struct, st_created = hm.SalaryStructure.objects.update_or_create(
        company=company,
        name=struct_name,
        defaults={"version": 1, "starts_on": datetime.date(2026, 1, 1)},
    )
    stats.record("SalaryStructure", st_created)

    for emp_code, emp in emp_map.items():
        base_salary = hrms_spec.get("ctc_map", {}).get(emp_code, Decimal("50000.00"))
        _, ca_created = hm.CompensationAssignment.objects.update_or_create(
            company=company,
            employment=emp,
            structure=struct,
            defaults={
                "monthly_base_salary": base_salary,
                "currency": "INR",
                "currency_precision": 2,
                "starts_on": datetime.date(2026, 1, 1),
                "created_by": owner_user,
            },
        )
        stats.record("CompensationAssignment", ca_created)

    # 10. Payroll Period, Run, Lines, Payslips
    if le:
        period, pr_created = hm.PayrollPeriod.objects.update_or_create(
            company=company,
            legal_entity=le,
            name="October 2026",
            defaults={
                "starts_on": datetime.date(2026, 10, 1),
                "ends_on": datetime.date(2026, 10, 31),
                "status": "closed",
                "created_by": owner_user,
            },
        )
        stats.record("PayrollPeriod", pr_created)

        run, run_created = hm.PayrollRun.objects.update_or_create(
            company=company,
            period=period,
            run_number=1,
            defaults={
                "status": "approved",
                "engine_version": "1.0",
                "input_snapshot": {},
                "output_snapshot": {},
                "created_by": owner_user,
                "submitted_at": timezone.now(),
                "approved_at": timezone.now(),
                "approved_by": owner_user,
            },
        )
        stats.record("PayrollRun", run_created)

        for emp_code, emp in emp_map.items():
            base = hrms_spec.get("ctc_map", {}).get(emp_code, Decimal("50000.00"))
            gross = base
            deductions = Decimal("2000.00")
            net = gross - deductions
            line, l_created = hm.PayrollLine.objects.update_or_create(
                company=company,
                run=run,
                employment=emp,
                defaults={
                    "currency": "INR",
                    "earnings": gross,
                    "deductions": deductions,
                    "net_pay": net,
                    "inputs": {"basic": str(gross * Decimal("0.5")), "hra": str(gross * Decimal("0.25")), "special": str(gross * Decimal("0.25"))},
                    "outputs": {"epf": "1800.00", "pt": "200.00"},
                },
            )
            stats.record("PayrollLine", l_created)

            ps = hm.Payslip.objects.filter(company=company, run=run, line=line).first()
            if not ps:
                hm.Payslip.objects.create(
                    company=company,
                    run=run,
                    line=line,
                    snapshot={"gross": str(gross), "net": str(net), "deductions": str(deductions)},
                )
                stats.record("Payslip", True)
            else:
                stats.record("Payslip", False)

    # 11. Onboarding Tasks & HR Requests
    for ob in hrms_spec.get("onboarding_tasks", []):
        emp = emp_map.get(ob["person_code"])
        if not emp:
            continue
        _, ob_created = hm.OnboardingTask.objects.update_or_create(
            company=company,
            employment=emp,
            title=ob["title"],
            defaults={
                "category": ob.get("category", "it_setup"),
                "status": ob.get("status", "completed"),
                "due_date": ob.get("due_date", datetime.date(2026, 10, 31)),
            },
        )
        stats.record("OnboardingTask", ob_created)

    for hrr in hrms_spec.get("hr_requests", []):
        emp = emp_map.get(hrr["person_code"])
        if not emp:
            continue
        _, hr_created = hm.HRRequest.objects.update_or_create(
            company=company,
            employment=emp,
            subject=hrr["subject"],
            defaults={
                "category": hrr.get("category", "equipment"),
                "priority": hrr.get("priority", "medium"),
                "status": hrr.get("status", "resolved"),
                "description": hrr.get("description", ""),
                "created_by": owner_user,
            },
        )
        stats.record("HRRequest", hr_created)


def seed_projects(company: Company, owner_user: User, projects_spec: dict, people_map: dict[str, Person], departments_map: dict[str, Department], stats: StatsCollector) -> None:
    # 1. Project Settings
    set_spec = projects_spec.get("settings", {})
    _, ps_created = pm.ProjectSettings.objects.update_or_create(
        company=company,
        defaults={
            "task_id_prefix": set_spec.get("task_id_prefix", "PRJ"),
            "allow_time_tracking": True,
            "require_time_approval": True,
        },
    )
    stats.record("ProjectSettings", ps_created)

    # 2. Projects
    projects_map = {}
    for p in projects_spec.get("projects", []):
        owner = people_map.get(p.get("owner_code"))
        pm_person = people_map.get(p.get("pm_code"), owner)
        prj, created = pm.Project.objects.update_or_create(
            company=company,
            code=p["code"],
            defaults={
                "name": p["name"],
                "description": p.get("description", ""),
                "status": p.get("status", pm.ProjectStatus.ACTIVE),
                "priority": p.get("priority", pm.ProjectPriority.MEDIUM),
                "owner_person": owner,
                "project_manager": pm_person,
                "start_date": p.get("start_date", datetime.date(2026, 1, 15)),
                "due_date": p.get("due_date", datetime.date(2026, 12, 31)),
                "budget_amount": p.get("budget_amount", Decimal("0.00")),
                "currency": "INR",
                "progress_percentage": p.get("progress_percentage", 0),
                "is_billable": p.get("is_billable", True),
                "created_by": owner_user,
            },
        )
        projects_map[p["code"]] = prj
        stats.record("Project", created)

        # Members
        for m in p.get("members", []):
            person = people_map.get(m["person_code"])
            if not person:
                continue
            _, mem_created = pm.ProjectMember.objects.update_or_create(
                company=company,
                project=prj,
                person=person,
                defaults={"role": m.get("role", pm.MemberRole.CONTRIBUTOR)},
            )
            stats.record("ProjectMember", mem_created)

        # Org Unit
        unit_code = p.get("unit_code")
        if unit_code and unit_code in departments_map:
            _, pou_created = pm.ProjectOrganizationUnit.objects.update_or_create(
                company=company,
                project=prj,
                department=departments_map[unit_code],
                defaults={"is_primary": True},
            )
            stats.record("ProjectOrganizationUnit", pou_created)

    # 3. Milestones
    milestones_map = {}
    for m in projects_spec.get("milestones", []):
        prj = projects_map.get(m["project_code"])
        if not prj:
            continue
        ms, created = pm.ProjectMilestone.objects.update_or_create(
            company=company,
            project=prj,
            title=m["title"],
            defaults={
                "description": m.get("description", ""),
                "due_date": m.get("due_date"),
                "status": m.get("status", pm.MilestoneStatus.PLANNED),
                "order": m.get("order", 1),
            },
        )
        milestones_map[m["key"]] = ms
        stats.record("ProjectMilestone", created)

    # 4. Tasks
    tasks_map = {}
    for t in projects_spec.get("tasks", []):
        prj = projects_map.get(t["project_code"])
        if not prj:
            continue
        ms = milestones_map.get(t.get("milestone_key"))
        assignee = people_map.get(t.get("assignee_code"))
        reviewer = people_map.get(t.get("reviewer_code"))
        first_person = list(people_map.values())[0] if people_map else None
        task, created = pm.ProjectTask.objects.update_or_create(
            company=company,
            project=prj,
            code=t["code"],
            defaults={
                "title": t["title"],
                "description": t.get("description", ""),
                "status": t.get("status", pm.TaskStatus.TODO),
                "priority": t.get("priority", pm.TaskPriority.MEDIUM),
                "milestone": ms,
                "creator": owner_user,
                "creator_person": assignee or first_person,
                "assignee": assignee,
                "reviewer": reviewer,
                "start_date": t.get("start_date"),
                "due_date": t.get("due_date"),
                "estimated_hours": t.get("estimated_hours", Decimal("0.00")),
                "actual_hours": t.get("actual_hours", Decimal("0.00")),
            },
        )
        tasks_map[t["code"]] = task
        stats.record("ProjectTask", created)

    # 5. Timesheets
    for te in projects_spec.get("time_entries", []):
        prj = projects_map.get(te["project_code"])
        task = tasks_map.get(te.get("task_code"))
        person = people_map.get(te["person_code"])
        approver = people_map.get(te.get("approver_code"))
        if not person:
            continue
        _, created = pm.ProjectTimeEntry.objects.update_or_create(
            company=company,
            project=prj,
            task=task,
            person=person,
            work_date=te["work_date"],
            defaults={
                "user": owner_user,
                "duration_minutes": te.get("duration_minutes", 480),
                "description": te.get("description", "Work logged"),
                "is_billable": te.get("is_billable", True),
                "status": te.get("status", pm.TimesheetStatus.APPROVED),
                "approver_person": approver,
                "approved_at": timezone.now() if te.get("status") == pm.TimesheetStatus.APPROVED else None,
            },
        )
        stats.record("ProjectTimeEntry", created)


def seed_crm(company: Company, owner_user: User, crm_spec: dict, parties_map: dict[str, Party], stats: StatsCollector) -> None:
    accounts_map = {}
    for acc in crm_spec.get("accounts", []):
        party = parties_map.get(acc["party_name"])
        if not party:
            continue
        obj, created = crm_m.Account.objects.update_or_create(
            company=company,
            name=acc["name"],
            defaults={"party": party},
        )
        accounts_map[acc["name"]] = obj
        stats.record("CRM.Account", created)

    for con in crm_spec.get("contacts", []):
        party = parties_map.get(con["party_name"])
        acc = accounts_map.get(con.get("account_name"))
        if not party:
            continue
        _, created = crm_m.Contact.objects.update_or_create(
            company=company,
            email=con["email"],
            defaults={
                "party": party,
                "account": acc,
                "first_name": con.get("first_name", ""),
                "last_name": con.get("last_name", ""),
            },
        )
        stats.record("CRM.Contact", created)

    for ld in crm_spec.get("leads", []):
        party = parties_map.get(ld.get("party_name"))
        _, created = crm_m.Lead.objects.update_or_create(
            company=company,
            title=ld["title"],
            defaults={
                "party": party,
                "status": ld.get("status", crm_m.LeadStatus.NEW),
                "email": ld.get("email", ""),
            },
        )
        stats.record("CRM.Lead", created)

    for opp in crm_spec.get("opportunities", []):
        acc = accounts_map.get(opp["account_name"])
        if not acc:
            continue
        _, created = crm_m.Opportunity.objects.update_or_create(
            company=company,
            account=acc,
            name=opp["name"],
            defaults={
                "stage": opp.get("stage", crm_m.OpportunityStage.QUALIFICATION),
                "amount_minor": opp.get("amount_minor", 0),
            },
        )
        stats.record("CRM.Opportunity", created)


def seed_commerce(company: Company, owner_user: User, commerce_spec: dict, parties_map: dict[str, Party], stats: StatsCollector) -> None:
    products_map = {}
    for p in commerce_spec.get("products", []):
        prod, created = comm_m.Product.objects.update_or_create(
            company=company,
            sku=p["sku"],
            defaults={
                "name": p["name"],
                "price_minor": p["price_minor"],
                "status": p.get("status", comm_m.ProductStatus.ACTIVE),
            },
        )
        products_map[p["sku"]] = prod
        stats.record("Commerce.Product", created)

    for o in commerce_spec.get("orders", []):
        party = parties_map.get(o["party_name"])
        if not party:
            continue
        order_num = o.get("order_number", f"ORD-{party.display_name[:3].upper()}-001")
        order, created = comm_m.Order.objects.update_or_create(
            company=company,
            order_number=order_num,
            defaults={
                "party": party,
                "status": o.get("status", comm_m.OrderStatus.PLACED),
                "currency": o.get("currency", "INR"),
                "total_minor": o.get("total_minor", 0),
            },
        )
        stats.record("Commerce.Order", created)

        # Lines
        for line in o.get("lines", []):
            prod = products_map.get(line["sku"])
            if not prod:
                continue
            qty = line.get("quantity", 1)
            u_price = line.get("unit_price_minor", prod.price_minor)
            _, l_created = comm_m.OrderLine.objects.update_or_create(
                company=company,
                order=order,
                product=prod,
                defaults={
                    "quantity": qty,
                    "unit_price_minor": u_price,
                    "total_minor": qty * u_price,
                },
            )
            stats.record("Commerce.OrderLine", l_created)
