"""Unified management command to seed all three Pulse ERP demo companies idempotently.

Supports:
- Nimbus Labs (Technology / SaaS: hrms, projects, crm)
- Aether Precision (Industrial Manufacturing: hrms, projects, crm)
- Lotus Lane (Specialty Retail: hrms, projects, commerce)
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.tenants.demo_seeders.base import StatsCollector
from apps.tenants.demo_seeders.technology import seed_technology_company
from apps.tenants.demo_seeders.manufacturing import seed_manufacturing_company
from apps.tenants.demo_seeders.retail import seed_retail_company
from apps.tenants.models import Company
from apps.organization.models import Department, Person
from apps.modules_registry.models import CompanyModuleInstallation
import apps.hrms.models as hm
import apps.projects.models as pm
import apps.crm.models as crm_m
import apps.commerce.models as comm_m


class Command(BaseCommand):
    help = "Seed Pulse ERP demo companies (Technology, Manufacturing, Retail) with full module data."

    def add_arguments(self, parser):
        parser.add_argument(
            "--company",
            choices=["all", "technology", "manufacturing", "retail"],
            default="all",
            help="Which company to seed (default: all).",
        )
        parser.add_argument(
            "--password",
            default="a-long-passphrase",
            help="Default password for seeded demo user accounts.",
        )
        parser.add_argument(
            "--skip-verify",
            action="store_true",
            help="Skip post-seed verification checks.",
        )

    def handle(self, *args, **options):
        target = options["company"]
        password = options["password"]
        skip_verify = options["skip_verify"]
        stats = StatsCollector()

        self.stdout.write(self.style.NOTICE(f"Starting Pulse ERP demo seeding for target: {target}..."))

        if target in ("all", "technology"):
            self.stdout.write(self.style.HTTP_INFO("\n>>> Seeding Nimbus Labs (Technology / SaaS)..."))
            with transaction.atomic():
                seed_technology_company(password=password, stats=stats)

        if target in ("all", "manufacturing"):
            self.stdout.write(self.style.HTTP_INFO("\n>>> Seeding Aether Precision (Manufacturing)..."))
            with transaction.atomic():
                seed_manufacturing_company(password=password, stats=stats)

        if target in ("all", "retail"):
            self.stdout.write(self.style.HTTP_INFO("\n>>> Seeding Lotus Lane (Retail)..."))
            with transaction.atomic():
                seed_retail_company(password=password, stats=stats)

        if not skip_verify:
            self._verify_all(target, stats)

        self._print_report(stats)

    def _verify_all(self, target: str, stats: StatsCollector):
        self.stdout.write(self.style.NOTICE("\nVerifying database records and tenant isolation..."))

        expected_companies = []
        if target in ("all", "technology"):
            expected_companies.append(("nimbus-labs", 16, 6, ["hrms", "projects", "crm"]))
        if target in ("all", "manufacturing"):
            expected_companies.append(("aether-precision", 18, 10, ["hrms", "projects", "crm"]))
        if target in ("all", "retail"):
            expected_companies.append(("lotus-lane", 15, 6, ["hrms", "projects", "commerce"]))

        for slug, min_people, min_depts, modules in expected_companies:
            co = Company.objects.filter(slug=slug).first()
            if not co:
                self.stderr.write(self.style.ERROR(f"Company {slug} not found!"))
                continue

            # Core
            p_count = Person.objects.filter(company=co).count()
            d_count = Department.objects.filter(company=co).count()
            inst_count = CompanyModuleInstallation.objects.filter(company=co, status="installed").count()
            assert p_count >= min_people, f"Person count mismatch for {slug}: got {p_count}, expected >= {min_people}"
            assert d_count >= min_depts, f"Department count mismatch for {slug}: got {d_count}, expected >= {min_depts}"
            stats.validate("Company", 1)
            stats.validate("Person", p_count)
            stats.validate("Department", d_count)
            stats.validate("CompanyModuleInstallation", inst_count)

            # HRMS
            if "hrms" in modules:
                emp_count = hm.Employment.objects.filter(company=co).count()
                sess_count = hm.AttendanceSession.objects.filter(company=co).count()
                leave_count = hm.LeaveRequest.objects.filter(company=co).count()
                run_count = hm.PayrollRun.objects.filter(company=co).count()
                slip_count = hm.Payslip.objects.filter(company=co).count()
                assert emp_count >= min_people, f"Employment count for {slug} is {emp_count}"
                assert sess_count > 0, f"No attendance sessions for {slug}"
                assert run_count > 0, f"No payroll runs for {slug}"
                stats.validate("Employment", emp_count)
                stats.validate("AttendanceSession", sess_count)
                stats.validate("LeaveRequest", leave_count)
                stats.validate("PayrollRun", run_count)
                stats.validate("Payslip", slip_count)

            # Projects
            if "projects" in modules:
                prj_count = pm.Project.objects.filter(company=co).count()
                tsk_count = pm.ProjectTask.objects.filter(company=co).count()
                te_count = pm.ProjectTimeEntry.objects.filter(company=co).count()
                assert prj_count >= 3, f"Projects count for {slug} is {prj_count}"
                assert tsk_count >= 3, f"Tasks count for {slug} is {tsk_count}"
                stats.validate("Project", prj_count)
                stats.validate("ProjectTask", tsk_count)
                stats.validate("ProjectTimeEntry", te_count)

            # CRM
            if "crm" in modules:
                acc_count = crm_m.Account.objects.filter(company=co).count()
                opp_count = crm_m.Opportunity.objects.filter(company=co).count()
                assert acc_count >= 3, f"CRM Account count for {slug} is {acc_count}"
                assert opp_count >= 3, f"CRM Opportunity count for {slug} is {opp_count}"
                stats.validate("CRM.Account", acc_count)
                stats.validate("CRM.Opportunity", opp_count)

            # Commerce
            if "commerce" in modules:
                prod_count = comm_m.Product.objects.filter(company=co).count()
                ord_count = comm_m.Order.objects.filter(company=co).count()
                assert prod_count >= 6, f"Product count for {slug} is {prod_count}"
                assert ord_count >= 3, f"Order count for {slug} is {ord_count}"
                stats.validate("Commerce.Product", prod_count)
                stats.validate("Commerce.Order", ord_count)

            # Isolation check: cross-company leakage test
            other_companies = Company.objects.exclude(id=co.id)
            for other in other_companies:
                leaked_people = Person.objects.filter(company=co, department__company=other).count()
                assert leaked_people == 0, f"Cross-tenant department leakage in {slug}!"
                leaked_tasks = pm.ProjectTask.objects.filter(company=co, project__company=other).count()
                assert leaked_tasks == 0, f"Cross-tenant task leakage in {slug}!"

            self.stdout.write(self.style.SUCCESS(f"  [PASS] {slug}: Validated successfully with zero cross-tenant leakage."))

    def _print_report(self, stats: StatsCollector):
        self.stdout.write("\n" + "=" * 78)
        self.stdout.write(self.style.SUCCESS("PULSE ERP DEMO SEEDING EXECUTION REPORT"))
        self.stdout.write("=" * 78)
        self.stdout.write(f"{'Entity Name':<30} | {'Inserted':<10} | {'Updated':<10} | {'Validated':<10}")
        self.stdout.write("-" * 78)
        for row in stats.summary():
            self.stdout.write(
                f"{row['entity']:<30} | {row['inserted']:<10} | {row['updated']:<10} | {row['validated']:<10}"
            )
        self.stdout.write("=" * 78)
        self.stdout.write(self.style.SUCCESS("\nAll demo company seeding steps executed and verified successfully!\n"))
