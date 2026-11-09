from __future__ import annotations

import datetime
from decimal import Decimal

from apps.parties.models import PartyKind
import apps.projects.models as pm
import apps.crm.models as crm_m

from .base import (
    StatsCollector,
    ensure_base_catalogs,
    install_company_modules,
    seed_company,
    seed_crm,
    seed_custom_entities,
    seed_custom_fields,
    seed_hrms,
    seed_invitations,
    seed_owner_user,
    seed_parties,
    seed_people,
    seed_projects,
    seed_unit_types_and_departments,
    seed_users_and_memberships,
)

SLUG = "nimbus-labs"
OWNER_EMAIL = "anand.verma@nimbuslabs.example"


def seed_technology_company(password: str = "a-long-passphrase", stats: StatsCollector = None) -> dict:
    if stats is None:
        stats = StatsCollector()

    ensure_base_catalogs(stats)

    # 1. Owner User & Company
    owner_user = seed_owner_user(OWNER_EMAIL, "Anand", "Verma", password, stats)

    company_spec = {
        "slug": SLUG,
        "display_name": "Nimbus Labs",
        "legal_name": "Nimbus Labs Private Limited",
        "plan_code": "growth",
        "billing_interval": "month",
        "billing_profile": {
            "legal_name": "Nimbus Labs Private Limited",
            "billing_email": "finance@nimbuslabs.example",
            "country_code": "IN",
            "tax_id": "29AABCN8901C1Z4",
            "address_line1": "Salarpuria Towers, 4th Floor, Koramangala",
            "city": "Bengaluru",
            "state_code": "KA",
            "postal_code": "560034",
        },
    }
    company = seed_company(company_spec, owner_user, stats)

    # 2. Custom Fields
    custom_fields_spec = [
        {"entity": "person", "key": "primary-technology", "label": "Primary Technology", "field_type": "select", "options": ["Python/Django", "TypeScript/React", "Go/gRPC", "Rust", "DevOps/K8s"]},
        {"entity": "person", "key": "work-mode", "label": "Work Mode", "field_type": "select", "options": ["In-Office", "Hybrid", "Remote"]},
        {"entity": "person", "key": "github-handle", "label": "GitHub Handle", "field_type": "text"},
        {"entity": "organization_unit", "key": "cost-center", "label": "Cost Center", "field_type": "text"},
        {"entity": "organization_unit", "key": "on-call-team", "label": "On-Call Enabled", "field_type": "boolean"},
    ]
    seed_custom_fields(company, custom_fields_spec, stats)

    # 3. Unit Types & Departments
    types_spec = [
        {"key": "division", "name": "Division", "level": 1, "description": "Top level business group"},
        {"key": "department", "name": "Department", "level": 2, "description": "Functional department"},
        {"key": "team", "name": "Team", "level": 3, "description": "Operational squad"},
    ]
    units_spec = [
        {"code": "OU-TECH-ENG", "name": "Engineering & Technology", "unit_type_key": "division", "custom_data": {"cost-center": "CC-ENG-01"}},
        {"code": "OU-TECH-BE", "name": "Backend Platform", "unit_type_key": "department", "parent_code": "OU-TECH-ENG", "custom_data": {"cost-center": "CC-ENG-BE", "on-call-team": True}},
        {"code": "OU-TECH-FE", "name": "Frontend & Web Apps", "unit_type_key": "department", "parent_code": "OU-TECH-ENG", "custom_data": {"cost-center": "CC-ENG-FE", "on-call-team": False}},
        {"code": "OU-TECH-SEC", "name": "Security & SRE", "unit_type_key": "department", "parent_code": "OU-TECH-ENG", "custom_data": {"cost-center": "CC-ENG-OPS", "on-call-team": True}},
        {"code": "OU-TECH-PROD", "name": "Product & Design", "unit_type_key": "division", "custom_data": {"cost-center": "CC-PROD-01"}},
        {"code": "OU-TECH-CS", "name": "Customer Success", "unit_type_key": "division", "custom_data": {"cost-center": "CC-CS-01"}},
    ]
    departments_map = seed_unit_types_and_departments(company, types_spec, units_spec, stats)

    # 4. People (16 people)
    people_spec = [
        {"code": "EMP-T-001", "first_name": "Anand", "last_name": "Verma", "work_email": "anand.verma@nimbuslabs.example", "job_title": "Chief Executive Officer", "department_code": "OU-TECH-ENG", "custom_data": {"work-mode": "In-Office", "primary-technology": "Python/Django"}},
        {"code": "EMP-T-002", "first_name": "Divya", "last_name": "Sundaram", "work_email": "divya.sundaram@nimbuslabs.example", "job_title": "Chief Technology Officer", "department_code": "OU-TECH-ENG", "custom_data": {"work-mode": "In-Office", "primary-technology": "Go/gRPC"}},
        {"code": "EMP-T-003", "first_name": "Vikram", "last_name": "Sharma", "work_email": "vikram.sharma@nimbuslabs.example", "job_title": "VP of Engineering", "department_code": "OU-TECH-ENG", "manages_unit_code": "OU-TECH-ENG", "custom_data": {"work-mode": "Hybrid", "primary-technology": "Go/gRPC"}},
        {"code": "EMP-T-004", "first_name": "Arjun", "last_name": "Rao", "work_email": "arjun.rao@nimbuslabs.example", "job_title": "Principal Architect", "department_code": "OU-TECH-BE", "manages_unit_code": "OU-TECH-BE", "custom_data": {"work-mode": "Hybrid", "primary-technology": "Go/gRPC"}},
        {"code": "EMP-T-005", "first_name": "Sneha", "last_name": "Iyer", "work_email": "sneha.iyer@nimbuslabs.example", "job_title": "Senior Software Engineer", "department_code": "OU-TECH-FE", "manages_unit_code": "OU-TECH-FE", "custom_data": {"work-mode": "Hybrid", "primary-technology": "TypeScript/React"}},
        {"code": "EMP-T-006", "first_name": "Priya", "last_name": "Nair", "work_email": "priya.nair@nimbuslabs.example", "job_title": "Head of People & Culture", "department_code": "OU-TECH-ENG", "custom_data": {"work-mode": "In-Office"}},
        {"code": "EMP-T-007", "first_name": "Rajesh", "last_name": "Kumar", "work_email": "rajesh.kumar@nimbuslabs.example", "job_title": "Senior Site Reliability Engineer", "department_code": "OU-TECH-SEC", "manages_unit_code": "OU-TECH-SEC", "custom_data": {"work-mode": "Hybrid", "primary-technology": "DevOps/K8s"}},
        {"code": "EMP-T-008", "first_name": "Ananya", "last_name": "Roy", "work_email": "ananya.roy@nimbuslabs.example", "job_title": "Principal Product Manager", "department_code": "OU-TECH-PROD", "manages_unit_code": "OU-TECH-PROD", "custom_data": {"work-mode": "Hybrid"}},
        {"code": "EMP-T-009", "first_name": "Karthik", "last_name": "Menon", "work_email": "karthik.menon@nimbuslabs.example", "job_title": "Lead Product Designer", "department_code": "OU-TECH-PROD", "custom_data": {"work-mode": "Hybrid"}},
        {"code": "EMP-T-010", "first_name": "Neha", "last_name": "Joshi", "work_email": "neha.joshi@nimbuslabs.example", "job_title": "Customer Success Lead", "department_code": "OU-TECH-CS", "manages_unit_code": "OU-TECH-CS", "custom_data": {"work-mode": "Hybrid"}},
        {"code": "EMP-T-011", "first_name": "Rohan", "last_name": "Mehta", "work_email": "rohan.mehta@nimbuslabs.example", "job_title": "Software Engineer", "department_code": "OU-TECH-BE", "custom_data": {"work-mode": "In-Office", "primary-technology": "Python/Django"}},
        {"code": "EMP-T-012", "first_name": "Meera", "last_name": "Pillai", "work_email": "meera.pillai@nimbuslabs.example", "job_title": "Customer Support Specialist", "department_code": "OU-TECH-CS", "custom_data": {"work-mode": "In-Office"}},
        {"code": "EMP-T-013", "first_name": "Sanjay", "last_name": "Hegde", "work_email": "sanjay.hegde@nimbuslabs.example", "job_title": "Finance Controller", "department_code": "OU-TECH-ENG", "custom_data": {"work-mode": "Hybrid"}},
        {"code": "EMP-T-014", "first_name": "Kavita", "last_name": "Patel", "work_email": "kavita.patel@nimbuslabs.example", "job_title": "Senior Software Engineer", "department_code": "OU-TECH-FE", "custom_data": {"work-mode": "Remote", "primary-technology": "TypeScript/React"}},
        {"code": "EMP-T-015", "first_name": "Aditya", "last_name": "Bhat", "work_email": "aditya.bhat@nimbuslabs.example", "job_title": "Software Engineer", "department_code": "OU-TECH-BE", "custom_data": {"work-mode": "In-Office", "primary-technology": "Go/gRPC"}},
        {"code": "EMP-T-016", "first_name": "Deepa", "last_name": "George", "work_email": "deepa.george@nimbuslabs.example", "job_title": "People Operations Specialist", "department_code": "OU-TECH-ENG", "custom_data": {"work-mode": "Hybrid"}},
    ]
    people_map = seed_people(company, owner_user, people_spec, departments_map, stats)

    # 5. Users and Memberships
    users_spec = [
        {"email": "anand.verma@nimbuslabs.example", "name": "Anand Verma", "person_code": "EMP-T-001", "role_slug": "owner", "is_owner": True},
        {"email": "divya.sundaram@nimbuslabs.example", "name": "Divya Sundaram", "person_code": "EMP-T-002", "role_slug": "administrator"},
        {"email": "vikram.sharma@nimbuslabs.example", "name": "Vikram Sharma", "person_code": "EMP-T-003", "role_slug": "department_manager"},
        {"email": "arjun.rao@nimbuslabs.example", "name": "Arjun Rao", "person_code": "EMP-T-004", "role_slug": "department_manager"},
        {"email": "sneha.iyer@nimbuslabs.example", "name": "Sneha Iyer", "person_code": "EMP-T-005", "role_slug": "department_manager"},
        {"email": "priya.nair@nimbuslabs.example", "name": "Priya Nair", "person_code": "EMP-T-006", "role_slug": "hr_manager"},
        {"email": "rajesh.kumar@nimbuslabs.example", "name": "Rajesh Kumar", "person_code": "EMP-T-007", "role_slug": "employee"},
        {"email": "ananya.roy@nimbuslabs.example", "name": "Ananya Roy", "person_code": "EMP-T-008", "role_slug": "department_manager"},
        {"email": "neha.joshi@nimbuslabs.example", "name": "Neha Joshi", "person_code": "EMP-T-010", "role_slug": "department_manager"},
        {"email": "rohan.mehta@nimbuslabs.example", "name": "Rohan Mehta", "person_code": "EMP-T-011", "role_slug": "employee"},
        {"email": "aditya.bhat@nimbuslabs.example", "name": "Aditya Bhat", "person_code": "EMP-T-015", "role_slug": "employee"},
    ]
    memberships_map = seed_users_and_memberships(company, owner_user, users_spec, people_map, password, stats)

    # 6. Invitations
    invitations_spec = [
        {"email": "contractor.infra@external-dev.example", "status": "pending", "custom_data": {"role": "Cloud Consultant"}},
        {"email": "advisor.tech@advisory.example", "status": "pending", "custom_data": {"role": "Technical Advisor"}},
    ]
    seed_invitations(company, owner_user, invitations_spec, stats)

    # 7. Parties
    parties_spec = [
        {"name": "CloudScale Technologies Pvt Ltd", "kind": PartyKind.ORGANIZATION},
        {"name": "Bharat FinServ Digital Limited", "kind": PartyKind.ORGANIZATION},
        {"name": "Apex Logistics Enterprise", "kind": PartyKind.ORGANIZATION},
        {"name": "AWS India Cloud Services", "kind": PartyKind.ORGANIZATION},
        {"name": "Google Cloud India Pvt Ltd", "kind": PartyKind.ORGANIZATION},
    ]
    parties_map = seed_parties(company, parties_spec, stats)

    # 8. Custom Entities
    entities_spec = [
        {
            "slug": "office-locations",
            "name": "Office Locations",
            "description": "Physical corporate offices and hubs",
            "fields": [
                {"key": "code", "label": "Location Code", "field_type": "text", "required": True, "is_primary": True},
                {"key": "city", "label": "City", "field_type": "text", "required": True},
                {"key": "seats", "label": "Seating Capacity", "field_type": "number"},
            ],
        },
        {
            "slug": "company-assets",
            "name": "Company Assets",
            "description": "Hardware and devices issued to staff",
            "fields": [
                {"key": "asset-tag", "label": "Asset Tag", "field_type": "text", "required": True, "is_primary": True},
                {"key": "model", "label": "Model Name", "field_type": "text", "required": True},
                {"key": "assigned-employee", "label": "Assigned Employee", "field_type": "reference", "config": {"target": "person", "multiple": False}},
            ],
        },
    ]
    records_spec = [
        {"entity_slug": "office-locations", "lookup_key": "LOC-BLR", "data": {"code": "LOC-BLR", "city": "Bengaluru", "seats": 80}},
        {"entity_slug": "office-locations", "lookup_key": "LOC-COK", "data": {"code": "LOC-COK", "city": "Kochi", "seats": 24}},
        {"entity_slug": "company-assets", "lookup_key": "AST-2026-001", "data": {"asset-tag": "AST-2026-001", "model": "MacBook Pro 16 M3 Max", "assigned-employee": "EMP-T-004"}},
        {"entity_slug": "company-assets", "lookup_key": "AST-2026-002", "data": {"asset-tag": "AST-2026-002", "model": "MacBook Pro 14 M3 Pro", "assigned-employee": "EMP-T-005"}},
    ]
    seed_custom_entities(company, owner_user, entities_spec, records_spec, people_map, departments_map, stats)

    # 9. Install Modules (hrms, projects, crm)
    install_company_modules(company, owner_user, ["hrms", "projects", "crm"], stats)

    # 10. HRMS Domain Data
    ctc_map = {
        "EMP-T-001": Decimal("458333.33"),
        "EMP-T-002": Decimal("433333.33"),
        "EMP-T-003": Decimal("366666.67"),
        "EMP-T-004": Decimal("300000.00"),
        "EMP-T-005": Decimal("233333.33"),
        "EMP-T-006": Decimal("216666.67"),
        "EMP-T-007": Decimal("250000.00"),
        "EMP-T-008": Decimal("266666.67"),
        "EMP-T-009": Decimal("200000.00"),
        "EMP-T-010": Decimal("166666.67"),
        "EMP-T-011": Decimal("133333.33"),
        "EMP-T-012": Decimal("70833.33"),
        "EMP-T-013": Decimal("200000.00"),
        "EMP-T-014": Decimal("225000.00"),
        "EMP-T-015": Decimal("116666.67"),
        "EMP-T-016": Decimal("83333.33"),
    }
    hrms_spec = {
        "legal_entity": {"code": "LE-NL-01", "name": "Nimbus Labs Private Limited"},
        "work_locations": [
            {"code": "LOC-BLR-HQ", "name": "Bengaluru Tech HQ", "address": {"city": "Bengaluru", "state": "Karnataka"}},
            {"code": "LOC-COK-DC", "name": "Kochi Delivery Center", "address": {"city": "Kochi", "state": "Kerala"}},
            {"code": "LOC-REMOTE", "name": "All-India Remote", "address": {"city": "Remote", "state": "All India"}},
        ],
        "designations": [
            {"code": "DES-CEO", "name": "Chief Executive Officer"},
            {"code": "DES-CTO", "name": "Chief Technology Officer"},
            {"code": "DES-VP-ENG", "name": "VP of Engineering"},
            {"code": "DES-ENG-LEAD", "name": "Principal Architect"},
            {"code": "DES-SR-ENG", "name": "Senior Software Engineer"},
            {"code": "DES-ENG", "name": "Software Engineer"},
            {"code": "DES-DEV-OPS", "name": "Senior Site Reliability Engineer"},
            {"code": "DES-HR-MGR", "name": "Head of People & Culture"},
            {"code": "DES-PROD-MGR", "name": "Principal Product Manager"},
            {"code": "DES-CS-LEAD", "name": "Customer Success Lead"},
        ],
        "shifts": [
            {"code": "SHIFT-TECH-FLEX", "name": "Tech Flexible Hours", "starts_at": datetime.time(9, 30), "ends_at": datetime.time(18, 30), "grace_minutes": 30},
            {"code": "SHIFT-CS-A", "name": "Customer Support Morning", "starts_at": datetime.time(7, 0), "ends_at": datetime.time(16, 0), "grace_minutes": 15},
        ],
        "work_schedules": [
            {"name": "Standard 5-Day Hybrid", "weekdays": [0, 1, 2, 3, 4]},
        ],
        "attendance_policies": [
            {"name": "Standard Tech Attendance Policy", "allowed_methods": ["web", "mobile"]},
        ],
        "employments": [
            {"person_code": f"EMP-T-{i:03d}", "employee_number": f"NL-EMP-{i:03d}", "starts_on": datetime.date(2020 if i < 5 else 2022 if i < 12 else 2024, 1, 15)}
            for i in range(1, 17)
        ],
        "attendance_sessions": [
            {"person_code": "EMP-T-004", "work_date": datetime.date(2026, 10, 20), "status": "complete", "minutes_worked": 540},
            {"person_code": "EMP-T-005", "work_date": datetime.date(2026, 10, 20), "status": "complete", "minutes_worked": 540},
            {"person_code": "EMP-T-007", "work_date": datetime.date(2026, 10, 20), "status": "complete", "minutes_worked": 520},
            {"person_code": "EMP-T-010", "work_date": datetime.date(2026, 10, 20), "status": "complete", "minutes_worked": 510},
            {"person_code": "EMP-T-011", "work_date": datetime.date(2026, 10, 20), "status": "complete", "minutes_worked": 480},
            {"person_code": "EMP-T-014", "work_date": datetime.date(2026, 10, 20), "status": "complete", "minutes_worked": 480},
            {"person_code": "EMP-T-015", "work_date": datetime.date(2026, 10, 20), "status": "complete", "minutes_worked": 480},
        ],
        "leave_policies": [
            {"name": "Casual Leave (CL)", "days_per_year": 12},
            {"name": "Sick / Medical Leave (SL)", "days_per_year": 10},
            {"name": "Privilege / Earned Leave (PL)", "days_per_year": 18},
        ],
        "leave_requests": [
            {"person_code": "EMP-T-015", "policy_name": "Casual Leave (CL)", "starts_on": datetime.date(2026, 10, 20), "ends_on": datetime.date(2026, 10, 21), "reason": "Family emergency Mysore", "status": "approved", "approver_code": "EMP-T-004"},
            {"person_code": "EMP-T-005", "policy_name": "Privilege / Earned Leave (PL)", "starts_on": datetime.date(2026, 11, 10), "ends_on": datetime.date(2026, 11, 14), "reason": "Annual vacation", "status": "pending", "approver_code": "EMP-T-003"},
            {"person_code": "EMP-T-012", "policy_name": "Sick / Medical Leave (SL)", "starts_on": datetime.date(2026, 10, 14), "ends_on": datetime.date(2026, 10, 14), "reason": "Viral fever", "status": "approved", "approver_code": "EMP-T-010"},
        ],
        "salary_structure_name": "Tech CTC Structure (India)",
        "ctc_map": ctc_map,
        "onboarding_tasks": [
            {"person_code": "EMP-T-015", "title": "MacBook Pro Setup & SSH Keys Provisioning", "category": "it_setup"},
            {"person_code": "EMP-T-015", "title": "SOC-2 Security Awareness Training & Acknowledgement", "category": "compliance"},
            {"person_code": "EMP-T-016", "title": "HR Benefit Enrollment & Bank Details Validation", "category": "hr"},
        ],
        "hr_requests": [
            {"person_code": "EMP-T-011", "subject": "Request for 4K external display for frontend audit", "category": "hardware", "priority": "medium"},
            {"person_code": "EMP-T-014", "subject": "Leave balance query regarding earned leave carry forward", "category": "payroll", "priority": "low"},
        ],
    }
    seed_hrms(company, owner_user, hrms_spec, people_map, departments_map, stats)

    # 11. Projects & Work Management
    projects_spec = {
        "settings": {"task_id_prefix": "NL"},
        "projects": [
            {
                "code": "PRJ-NL-01",
                "name": "Control Plane v3 Architecture",
                "description": "Multi-region Kubernetes microservices control plane and Envoy ingress gateway",
                "status": pm.ProjectStatus.ACTIVE,
                "priority": pm.ProjectPriority.HIGH,
                "owner_code": "EMP-T-004",
                "pm_code": "EMP-T-004",
                "unit_code": "OU-TECH-BE",
                "budget_amount": Decimal("8500000.00"),
                "progress_percentage": 68,
                "members": [
                    {"person_code": "EMP-T-003", "role": pm.MemberRole.LEAD},
                    {"person_code": "EMP-T-004", "role": pm.MemberRole.MANAGER},
                    {"person_code": "EMP-T-007", "role": pm.MemberRole.CONTRIBUTOR},
                    {"person_code": "EMP-T-011", "role": pm.MemberRole.CONTRIBUTOR},
                    {"person_code": "EMP-T-015", "role": pm.MemberRole.CONTRIBUTOR},
                ],
            },
            {
                "code": "PRJ-NL-02",
                "name": "Customer Portal Redesign 2026",
                "description": "Next-gen web console redesign in Tailwind CSS and Storybook token system",
                "status": pm.ProjectStatus.ACTIVE,
                "priority": pm.ProjectPriority.MEDIUM,
                "owner_code": "EMP-T-005",
                "pm_code": "EMP-T-005",
                "unit_code": "OU-TECH-FE",
                "budget_amount": Decimal("3200000.00"),
                "progress_percentage": 52,
                "members": [
                    {"person_code": "EMP-T-005", "role": pm.MemberRole.MANAGER},
                    {"person_code": "EMP-T-009", "role": pm.MemberRole.CONTRIBUTOR},
                    {"person_code": "EMP-T-014", "role": pm.MemberRole.CONTRIBUTOR},
                ],
            },
            {
                "code": "PRJ-NL-03",
                "name": "Enterprise SOC-2 Type II Compliance",
                "description": "Audit readiness, automated IAM policy checks and pen-testing remediation",
                "status": pm.ProjectStatus.PLANNING,
                "priority": pm.ProjectPriority.URGENT,
                "owner_code": "EMP-T-003",
                "pm_code": "EMP-T-003",
                "unit_code": "OU-TECH-SEC",
                "budget_amount": Decimal("1500000.00"),
                "progress_percentage": 20,
                "members": [
                    {"person_code": "EMP-T-003", "role": pm.MemberRole.MANAGER},
                    {"person_code": "EMP-T-007", "role": pm.MemberRole.CONTRIBUTOR},
                ],
            },
        ],
        "milestones": [
            {"key": "M1-CP3", "project_code": "PRJ-NL-01", "title": "Multi-Region VPC & Kubernetes 1.30 Setup", "due_date": datetime.date(2026, 4, 15), "status": pm.MilestoneStatus.ACHIEVED, "order": 1},
            {"key": "M2-CP3", "project_code": "PRJ-NL-01", "title": "gRPC Microservice Mesh & Envoy Ingress", "due_date": datetime.date(2026, 10, 31), "status": pm.MilestoneStatus.IN_PROGRESS, "order": 2},
            {"key": "M3-CP3", "project_code": "PRJ-NL-01", "title": "End-to-End Chaos Testing & Failover Drills", "due_date": datetime.date(2026, 11, 30), "status": pm.MilestoneStatus.PLANNED, "order": 3},
            {"key": "M1-CPR", "project_code": "PRJ-NL-02", "title": "Design Token System & Storybook Catalog", "due_date": datetime.date(2026, 6, 30), "status": pm.MilestoneStatus.ACHIEVED, "order": 1},
            {"key": "M2-CPR", "project_code": "PRJ-NL-02", "title": "Self-Service Subscription Upgrade Flow", "due_date": datetime.date(2026, 11, 15), "status": pm.MilestoneStatus.IN_PROGRESS, "order": 2},
        ],
        "tasks": [
            {
                "code": "TSK-NL-101",
                "project_code": "PRJ-NL-01",
                "milestone_key": "M1-CP3",
                "title": "Deploy Terraform modules for ap-south-2 Hyderabad region",
                "description": "Setup AWS VPC peering, transit gateways and multi-AZ worker nodes.",
                "status": pm.TaskStatus.COMPLETED,
                "priority": pm.TaskPriority.HIGH,
                "assignee_code": "EMP-T-007",
                "reviewer_code": "EMP-T-004",
                "estimated_hours": Decimal("32.00"),
                "actual_hours": Decimal("28.00"),
            },
            {
                "code": "TSK-NL-102",
                "project_code": "PRJ-NL-01",
                "milestone_key": "M2-CP3",
                "title": "Implement mTLS client-certificate validation on Envoy gateway",
                "description": "Configure SPIFFE/SPIRE intermediate CA certificate rotation script.",
                "status": pm.TaskStatus.IN_PROGRESS,
                "priority": pm.TaskPriority.URGENT,
                "assignee_code": "EMP-T-004",
                "reviewer_code": "EMP-T-003",
                "estimated_hours": Decimal("40.00"),
                "actual_hours": Decimal("26.00"),
            },
            {
                "code": "TSK-NL-103",
                "project_code": "PRJ-NL-01",
                "milestone_key": "M2-CP3",
                "title": "Instrument OpenTelemetry distributed tracing across Auth & Billing services",
                "description": "Inject baggage headers and W3C tracecontext across all outward calls.",
                "status": pm.TaskStatus.IN_REVIEW,
                "priority": pm.TaskPriority.MEDIUM,
                "assignee_code": "EMP-T-011",
                "reviewer_code": "EMP-T-004",
                "estimated_hours": Decimal("24.00"),
                "actual_hours": Decimal("22.00"),
            },
            {
                "code": "TSK-NL-104",
                "project_code": "PRJ-NL-01",
                "milestone_key": "M3-CP3",
                "title": "Execute 10k RPS load test with k6 and inspect latency bottlenecks",
                "description": "Run distributed load testing cluster and observe p99 response times.",
                "status": pm.TaskStatus.TODO,
                "priority": pm.TaskPriority.HIGH,
                "assignee_code": "EMP-T-015",
                "reviewer_code": "EMP-T-004",
                "estimated_hours": Decimal("20.00"),
                "actual_hours": Decimal("0.00"),
            },
            {
                "code": "TSK-NL-201",
                "project_code": "PRJ-NL-02",
                "milestone_key": "M1-CPR",
                "title": "Build Figma Tokens sync pipeline to Tailwind CSS v4 variables",
                "description": "Sync colors, typography and spacing tokens via GitHub Actions.",
                "status": pm.TaskStatus.COMPLETED,
                "priority": pm.TaskPriority.MEDIUM,
                "assignee_code": "EMP-T-009",
                "reviewer_code": "EMP-T-005",
                "estimated_hours": Decimal("16.00"),
                "actual_hours": Decimal("15.00"),
            },
            {
                "code": "TSK-NL-202",
                "project_code": "PRJ-NL-02",
                "milestone_key": "M2-CPR",
                "title": "Refactor Organization Unit Switcher & Role Navigation",
                "description": "Implement accessible keyboard navigation and optimistic UI updates.",
                "status": pm.TaskStatus.IN_PROGRESS,
                "priority": pm.TaskPriority.HIGH,
                "assignee_code": "EMP-T-005",
                "reviewer_code": "EMP-T-008",
                "estimated_hours": Decimal("30.00"),
                "actual_hours": Decimal("18.00"),
            },
            {
                "code": "TSK-NL-203",
                "project_code": "PRJ-NL-02",
                "milestone_key": "M2-CPR",
                "title": "Integrate Invoice Download PDF with Razorpay / Stripe Billing Webhooks",
                "description": "Generate on-demand GST compliant invoice PDFs.",
                "status": pm.TaskStatus.TODO,
                "priority": pm.TaskPriority.MEDIUM,
                "assignee_code": "EMP-T-014",
                "reviewer_code": "EMP-T-005",
                "estimated_hours": Decimal("24.00"),
                "actual_hours": Decimal("0.00"),
            },
        ],
        "time_entries": [
            {
                "project_code": "PRJ-NL-01",
                "task_code": "TSK-NL-102",
                "person_code": "EMP-T-004",
                "approver_code": "EMP-T-003",
                "work_date": datetime.date(2026, 10, 19),
                "duration_minutes": 420,
                "description": "Configured SPIFFE/SPIRE intermediate CA certificate rotation script.",
                "status": pm.TimesheetStatus.APPROVED,
            },
            {
                "project_code": "PRJ-NL-02",
                "task_code": "TSK-NL-202",
                "person_code": "EMP-T-005",
                "approver_code": "EMP-T-003",
                "work_date": datetime.date(2026, 10, 19),
                "duration_minutes": 360,
                "description": "Implemented optimistic UI updates on tenant switcher dropdown.",
                "status": pm.TimesheetStatus.APPROVED,
            },
            {
                "project_code": "PRJ-NL-01",
                "task_code": "TSK-NL-103",
                "person_code": "EMP-T-011",
                "approver_code": "EMP-T-004",
                "work_date": datetime.date(2026, 10, 20),
                "duration_minutes": 480,
                "description": "Wrote middleware to attach correlation IDs and baggage to outward gRPC calls.",
                "status": pm.TimesheetStatus.SUBMITTED,
            },
        ],
    }
    seed_projects(company, owner_user, projects_spec, people_map, departments_map, stats)

    # 12. CRM Domain Data
    crm_spec = {
        "accounts": [
            {"name": "CloudScale Technologies Pvt Ltd", "party_name": "CloudScale Technologies Pvt Ltd"},
            {"name": "Bharat FinServ Digital Limited", "party_name": "Bharat FinServ Digital Limited"},
            {"name": "Apex Logistics Enterprise", "party_name": "Apex Logistics Enterprise"},
        ],
        "contacts": [
            {"email": "hariharan.nair@cloudscale.example", "party_name": "CloudScale Technologies Pvt Ltd", "account_name": "CloudScale Technologies Pvt Ltd", "first_name": "Hariharan", "last_name": "Nair"},
            {"email": "swati.saxena@bharatfinserv.example", "party_name": "Bharat FinServ Digital Limited", "account_name": "Bharat FinServ Digital Limited", "first_name": "Swati", "last_name": "Saxena"},
            {"email": "rahul.verma@apexlogistics.example", "party_name": "Apex Logistics Enterprise", "account_name": "Apex Logistics Enterprise", "first_name": "Rahul", "last_name": "Verma"},
        ],
        "leads": [
            {"title": "FinTech Microservices Scale Consultation", "party_name": "Bharat FinServ Digital Limited", "status": crm_m.LeadStatus.QUALIFIED, "email": "dev-lead@zetafin.example"},
            {"title": "AI Agent Orchestrator Evaluation", "status": crm_m.LeadStatus.NEW, "email": "founders@deepvector.example"},
        ],
        "opportunities": [
            {"account_name": "Bharat FinServ Digital Limited", "name": "Bharat FinServ — Multi-Region Cloud Migration", "stage": crm_m.OpportunityStage.NEGOTIATION, "amount_minor": 720000000},
            {"account_name": "CloudScale Technologies Pvt Ltd", "name": "CloudScale — Kubernetes Control Plane Licensing", "stage": crm_m.OpportunityStage.WON, "amount_minor": 360000000},
            {"account_name": "Apex Logistics Enterprise", "name": "Apex Logistics — Developer Toolchain Pilot", "stage": crm_m.OpportunityStage.PROPOSAL, "amount_minor": 240000000},
        ],
    }
    seed_crm(company, owner_user, crm_spec, parties_map, stats)

    return {"company": company, "owner": owner_user, "stats": stats}
