"""Report cross-tenant parent/child mismatches (ADR-021 Slice A).

Does not mutate data. Exit code 1 when any mismatch is found.
"""

from django.core.management.base import BaseCommand
from django.db.models import F


class Command(BaseCommand):
    help = "Audit tenant-owned FK pairs for company_id mismatches."

    def handle(self, *args, **options):
        findings: list[tuple[str, int]] = []

        from apps.hrms.models import LeaveBalance, LeaveRequest
        from apps.organization.models import Department, Person
        from apps.tenants.models import CompanyMembership, CustomEntityField, CustomEntityRecord

        from apps.authorization.models import MembershipRoleAssignment

        checks = [
            (
                "company_memberships.person",
                CompanyMembership.objects.filter(person__isnull=False).exclude(person__company_id=F("company_id")).count(),
            ),
            (
                "people.department",
                Person.objects.filter(department__isnull=False).exclude(department__company_id=F("company_id")).count(),
            ),
            (
                "departments.parent",
                Department.objects.filter(parent__isnull=False).exclude(parent__company_id=F("company_id")).count(),
            ),
            (
                "departments.manager",
                Department.objects.filter(manager__isnull=False).exclude(manager__company_id=F("company_id")).count(),
            ),
            (
                "departments.unit_type",
                Department.objects.filter(unit_type__isnull=False).exclude(unit_type__company_id=F("company_id")).count(),
            ),
            (
                "hrms_leave_requests.person",
                LeaveRequest.objects.exclude(person__company_id=F("company_id")).count(),
            ),
            (
                "hrms_leave_requests.policy",
                LeaveRequest.objects.exclude(policy__company_id=F("company_id")).count(),
            ),
            (
                "hrms_leave_balances.person",
                LeaveBalance.objects.exclude(person__company_id=F("company_id")).count(),
            ),
            (
                "hrms_leave_balances.policy",
                LeaveBalance.objects.exclude(policy__company_id=F("company_id")).count(),
            ),
            (
                "custom_entity_fields.entity",
                CustomEntityField.objects.exclude(entity__company_id=F("company_id")).count(),
            ),
            (
                "custom_entity_records.entity",
                CustomEntityRecord.objects.exclude(entity__company_id=F("company_id")).count(),
            ),
            (
                "membership_role_assignments.role_company",
                MembershipRoleAssignment.objects.exclude(role__company_id=F("membership__company_id")).count(),
            ),
        ]

        for label, count in checks:
            findings.append((label, count))
            if count:
                self.stdout.write(self.style.ERROR(f"{label}: {count}"))
            else:
                self.stdout.write(self.style.SUCCESS(f"{label}: 0"))

        bad = sum(count for _label, count in findings if count)
        if bad:
            self.stderr.write(self.style.ERROR(f"Found {bad} cross-tenant mismatch row(s)."))
            raise SystemExit(1)
        self.stdout.write(self.style.SUCCESS("No cross-tenant mismatches found."))
