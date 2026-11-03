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

SLUG = "aether-precision"
OWNER_EMAIL = "suresh.patil@aetherprecision.example"


def seed_manufacturing_company(password: str = "a-long-passphrase", stats: StatsCollector = None) -> dict:
    if stats is None:
        stats = StatsCollector()

    ensure_base_catalogs(stats)

    # 1. Owner User & Company
    owner_user = seed_owner_user(OWNER_EMAIL, "Suresh", "Patil", password, stats)

    company_spec = {
        "slug": SLUG,
        "display_name": "Aether Precision",
        "legal_name": "Aether Precision Components Private Limited",
        "plan_code": "enterprise",
        "billing_interval": "year",
        "billing_profile": {
            "legal_name": "Aether Precision Components Private Limited",
            "billing_email": "accounts@aetherprecision.example",
            "country_code": "IN",
            "tax_id": "27AABCA4321K1Z2",
            "address_line1": "Plot B-14, Chakan MIDC Phase II",
            "city": "Pune",
            "state_code": "MH",
            "postal_code": "410501",
        },
    }
    company = seed_company(company_spec, owner_user, stats)

    # 2. Custom Fields
    custom_fields_spec = [
        {"entity": "person", "key": "shift-roster", "label": "Shift Roster", "field_type": "select", "options": ["Shift A (Morning)", "Shift B (Evening)", "Shift C (Night)", "General Office"]},
        {"entity": "person", "key": "safety-cert", "label": "Safety Certification", "field_type": "text"},
        {"entity": "organization_unit", "key": "plant-code", "label": "Plant Code", "field_type": "text"},
        {"entity": "organization_unit", "key": "shift-type", "label": "Shift Type", "field_type": "select", "options": ["Rotating 3-Shift", "Single General", "Continuous 24/7"]},
    ]
    seed_custom_fields(company, custom_fields_spec, stats)

    # 3. Unit Types & Departments
    types_spec = [
        {"key": "division", "name": "Division", "level": 1},
        {"key": "plant", "name": "Plant", "level": 2},
        {"key": "department", "name": "Department", "level": 3},
        {"key": "line", "name": "Production Line", "level": 4},
    ]
    units_spec = [
        {"code": "OU-MFG-CORP", "name": "Corporate Office Pune", "unit_type_key": "division"},
        {"code": "OU-MFG-PUN", "name": "Chakan Machining Plant", "unit_type_key": "plant", "parent_code": "OU-MFG-CORP", "custom_data": {"plant-code": "PLT-PUN-01", "shift-type": "Rotating 3-Shift"}},
        {"code": "OU-MFG-CHN", "name": "Chennai Finishing Plant", "unit_type_key": "plant", "parent_code": "OU-MFG-CORP", "custom_data": {"plant-code": "PLT-CHN-02", "shift-type": "Single General"}},
        {"code": "OU-MFG-PRD", "name": "Machining & Production", "unit_type_key": "department", "parent_code": "OU-MFG-PUN"},
        {"code": "OU-MFG-LINE-A", "name": "CNC Cell A (Transmission)", "unit_type_key": "line", "parent_code": "OU-MFG-PRD"},
        {"code": "OU-MFG-LINE-B", "name": "CNC Cell B (Engine Blocks)", "unit_type_key": "line", "parent_code": "OU-MFG-PRD"},
        {"code": "OU-MFG-QA", "name": "Quality Assurance & Metrology", "unit_type_key": "department", "parent_code": "OU-MFG-PUN"},
        {"code": "OU-MFG-MNT", "name": "Plant Maintenance & Utilities", "unit_type_key": "department", "parent_code": "OU-MFG-PUN"},
        {"code": "OU-MFG-SCM", "name": "Supply Chain & Raw Stores", "unit_type_key": "department", "parent_code": "OU-MFG-PUN"},
        {"code": "OU-MFG-HR", "name": "Personnel & IR", "unit_type_key": "department", "parent_code": "OU-MFG-CORP"},
    ]
    departments_map = seed_unit_types_and_departments(company, types_spec, units_spec, stats)

    # 4. People (18 people)
    people_spec = [
        {"code": "EMP-M-001", "first_name": "Suresh", "last_name": "Patil", "work_email": "suresh.patil@aetherprecision.example", "job_title": "Managing Director", "department_code": "OU-MFG-CORP"},
        {"code": "EMP-M-002", "first_name": "Ramesh", "last_name": "Kulkarni", "work_email": "ramesh.kulkarni@aetherprecision.example", "job_title": "General Manager & Plant Head", "department_code": "OU-MFG-PUN", "manages_unit_code": "OU-MFG-PUN"},
        {"code": "EMP-M-003", "first_name": "Vikas", "last_name": "Shinde", "work_email": "vikas.shinde@aetherprecision.example", "job_title": "Production Manager", "department_code": "OU-MFG-PRD", "manages_unit_code": "OU-MFG-PRD"},
        {"code": "EMP-M-004", "first_name": "Amit", "last_name": "Deshmukh", "work_email": "amit.deshmukh@aetherprecision.example", "job_title": "CNC Cell Lead & Supervisor", "department_code": "OU-MFG-LINE-A", "manages_unit_code": "OU-MFG-LINE-A", "custom_data": {"shift-roster": "Shift A (Morning)"}},
        {"code": "EMP-M-005", "first_name": "Sachin", "last_name": "Jadhav", "work_email": "sachin.jadhav@aetherprecision.example", "job_title": "Senior CNC Programmer", "department_code": "OU-MFG-LINE-A"},
        {"code": "EMP-M-006", "first_name": "Sunita", "last_name": "Rao", "work_email": "sunita.rao@aetherprecision.example", "job_title": "Quality Assurance Lead", "department_code": "OU-MFG-QA", "manages_unit_code": "OU-MFG-QA"},
        {"code": "EMP-M-007", "first_name": "Mahesh", "last_name": "Pawar", "work_email": "mahesh.pawar@aetherprecision.example", "job_title": "Plant Maintenance Head", "department_code": "OU-MFG-MNT", "manages_unit_code": "OU-MFG-MNT"},
        {"code": "EMP-M-008", "first_name": "Ganesh", "last_name": "Gaikwad", "work_email": "ganesh.gaikwad@aetherprecision.example", "job_title": "CNC Machine Operator", "department_code": "OU-MFG-LINE-A", "custom_data": {"shift-roster": "Shift A (Morning)"}},
        {"code": "EMP-M-009", "first_name": "Nitin", "last_name": "More", "work_email": "nitin.more@aetherprecision.example", "job_title": "CNC Machine Operator", "department_code": "OU-MFG-LINE-A", "custom_data": {"shift-roster": "Shift A (Morning)"}},
        {"code": "EMP-M-010", "first_name": "Deepak", "last_name": "Chavan", "work_email": "deepak.chavan@aetherprecision.example", "job_title": "Tooling & Fixture Specialist", "department_code": "OU-MFG-PRD"},
        {"code": "EMP-M-011", "first_name": "Snehal", "last_name": "Kadam", "work_email": "snehal.kadam@aetherprecision.example", "job_title": "Head of Plant HR & IR", "department_code": "OU-MFG-HR", "manages_unit_code": "OU-MFG-HR"},
        {"code": "EMP-M-012", "first_name": "Rahul", "last_name": "Bhosale", "work_email": "rahul.bhosale@aetherprecision.example", "job_title": "Production Planning Lead", "department_code": "OU-MFG-PRD"},
        {"code": "EMP-M-013", "first_name": "Santosh", "last_name": "Mane", "work_email": "santosh.mane@aetherprecision.example", "job_title": "Mechanical Maintenance Tech", "department_code": "OU-MFG-MNT"},
        {"code": "EMP-M-014", "first_name": "Sanjay", "last_name": "Jagtap", "work_email": "sanjay.jagtap@aetherprecision.example", "job_title": "Chief Financial Officer", "department_code": "OU-MFG-CORP"},
        {"code": "EMP-M-015", "first_name": "Anand", "last_name": "Kale", "work_email": "anand.kale@aetherprecision.example", "job_title": "Supply Chain Manager", "department_code": "OU-MFG-SCM", "manages_unit_code": "OU-MFG-SCM"},
        {"code": "EMP-M-016", "first_name": "Pooja", "last_name": "Thorat", "work_email": "pooja.thorat@aetherprecision.example", "job_title": "CMM Quality Inspector", "department_code": "OU-MFG-QA"},
        {"code": "EMP-M-017", "first_name": "Vilas", "last_name": "Salunkhe", "work_email": "vilas.salunkhe@aetherprecision.example", "job_title": "Environmental Safety Officer", "department_code": "OU-MFG-HR"},
        {"code": "EMP-M-018", "first_name": "Vijay", "last_name": "Ghorpade", "work_email": "vijay.ghorpade@aetherprecision.example", "job_title": "CNC Machine Operator", "department_code": "OU-MFG-CHN", "custom_data": {"shift-roster": "Shift B (Evening)"}},
    ]
    people_map = seed_people(company, owner_user, people_spec, departments_map, stats)

    # 5. Users and Memberships
    users_spec = [
        {"email": "suresh.patil@aetherprecision.example", "name": "Suresh Patil", "person_code": "EMP-M-001", "role_slug": "owner", "is_owner": True},
        {"email": "ramesh.kulkarni@aetherprecision.example", "name": "Ramesh Kulkarni", "person_code": "EMP-M-002", "role_slug": "department_manager"},
        {"email": "vikas.shinde@aetherprecision.example", "name": "Vikas Shinde", "person_code": "EMP-M-003", "role_slug": "department_manager"},
        {"email": "amit.deshmukh@aetherprecision.example", "name": "Amit Deshmukh", "person_code": "EMP-M-004", "role_slug": "department_manager"},
        {"email": "sunita.rao@aetherprecision.example", "name": "Sunita Rao", "person_code": "EMP-M-006", "role_slug": "department_manager"},
        {"email": "snehal.kadam@aetherprecision.example", "name": "Snehal Kadam", "person_code": "EMP-M-011", "role_slug": "hr_manager"},
        {"email": "sachin.jadhav@aetherprecision.example", "name": "Sachin Jadhav", "person_code": "EMP-M-005", "role_slug": "employee"},
        {"email": "ganesh.gaikwad@aetherprecision.example", "name": "Ganesh Gaikwad", "person_code": "EMP-M-008", "role_slug": "employee"},
    ]
    memberships_map = seed_users_and_memberships(company, owner_user, users_spec, people_map, password, stats)

    # 6. Invitations
    invitations_spec = [
        {"email": "mazak.service@oem-rep.example", "status": "pending", "custom_data": {"role": "Field Service Engineer"}},
    ]
    seed_invitations(company, owner_user, invitations_spec, stats)

    # 7. Parties
    parties_spec = [
        {"name": "Tata Motors Limited", "kind": PartyKind.ORGANIZATION},
        {"name": "Bharat Heavy Forgings Limited", "kind": PartyKind.ORGANIZATION},
        {"name": "Mahindra Precision Systems", "kind": PartyKind.ORGANIZATION},
        {"name": "Deccan Steels & Alloys Pvt Ltd", "kind": PartyKind.ORGANIZATION},
        {"name": "Sandvik Coromant India", "kind": PartyKind.ORGANIZATION},
    ]
    parties_map = seed_parties(company, parties_spec, stats)

    # 8. Custom Entities
    entities_spec = [
        {
            "slug": "production-lines",
            "name": "Production Lines",
            "description": "Plant cells and conveyor lines",
            "fields": [
                {"key": "line-id", "label": "Line ID", "field_type": "text", "required": True, "is_primary": True},
                {"key": "description", "label": "Description", "field_type": "text"},
            ],
        },
        {
            "slug": "machines-and-equipment",
            "name": "Machines & Equipment",
            "description": "Industrial CNC mills, lathes, and CMMs",
            "fields": [
                {"key": "machine-tag", "label": "Machine Tag", "field_type": "text", "required": True, "is_primary": True},
                {"key": "model", "label": "Model Name", "field_type": "text", "required": True},
                {"key": "assigned-technician", "label": "Assigned Technician", "field_type": "reference", "config": {"target": "person", "multiple": False}},
            ],
        },
    ]
    records_spec = [
        {"entity_slug": "production-lines", "lookup_key": "LINE-A", "data": {"line-id": "LINE-A", "description": "Transmission Housing 5-Axis Line"}},
        {"entity_slug": "production-lines", "lookup_key": "LINE-B", "data": {"line-id": "LINE-B", "description": "Engine Block Horizontal Machining Line"}},
        {"entity_slug": "machines-and-equipment", "lookup_key": "MCH-VMC-01", "data": {"machine-tag": "MCH-VMC-01", "model": "Mazak VTC-800 5-Axis", "assigned-technician": "EMP-M-013"}},
        {"entity_slug": "machines-and-equipment", "lookup_key": "MCH-CMM-01", "data": {"machine-tag": "MCH-CMM-01", "model": "Zeiss Contura Bridge CMM", "assigned-technician": "EMP-M-016"}},
    ]
    seed_custom_entities(company, owner_user, entities_spec, records_spec, people_map, departments_map, stats)

    # 9. Install Modules (hrms, projects, crm)
    install_company_modules(company, owner_user, ["hrms", "projects", "crm"], stats)

    # 10. HRMS Domain Data
    ctc_map = {
        "EMP-M-001": Decimal("541666.67"),
        "EMP-M-002": Decimal("350000.00"),
        "EMP-M-003": Decimal("233333.33"),
        "EMP-M-004": Decimal("133333.33"),
        "EMP-M-005": Decimal("116666.67"),
        "EMP-M-006": Decimal("200000.00"),
        "EMP-M-007": Decimal("208333.33"),
        "EMP-M-008": Decimal("54166.67"),
        "EMP-M-009": Decimal("48333.33"),
        "EMP-M-010": Decimal("91666.67"),
        "EMP-M-011": Decimal("183333.33"),
        "EMP-M-012": Decimal("141666.67"),
        "EMP-M-013": Decimal("50000.00"),
        "EMP-M-014": Decimal("316666.67"),
        "EMP-M-015": Decimal("200000.00"),
        "EMP-M-016": Decimal("70833.33"),
        "EMP-M-017": Decimal("100000.00"),
        "EMP-M-018": Decimal("45833.33"),
    }
    hrms_spec = {
        "legal_entity": {"code": "LE-MFG-01", "name": "Aether Precision Components Private Limited"},
        "work_locations": [
            {"code": "LOC-PUN-HQ", "name": "Baner Corporate Office", "address": {"city": "Pune", "state": "Maharashtra"}},
            {"code": "LOC-CHK-PLT", "name": "Chakan Machining Plant", "address": {"city": "Pune", "state": "Maharashtra"}},
            {"code": "LOC-CHN-PLT", "name": "Chennai Finishing Plant", "address": {"city": "Chennai", "state": "Tamil Nadu"}},
        ],
        "designations": [
            {"code": "DES-MD", "name": "Managing Director"},
            {"code": "DES-PLANT-HEAD", "name": "General Manager & Plant Head"},
            {"code": "DES-PROD-MGR", "name": "Production Manager"},
            {"code": "DES-CNC-LEAD", "name": "CNC Cell Lead & Supervisor"},
            {"code": "DES-SR-CNC-PRG", "name": "Senior CNC Programmer"},
            {"code": "DES-CNC-OPR", "name": "CNC Machine Operator"},
            {"code": "DES-MAINT-HEAD", "name": "Plant Maintenance Head"},
            {"code": "DES-QA-LEAD", "name": "Quality Assurance Lead"},
            {"code": "DES-HR-LEAD", "name": "Head of Plant HR & IR"},
        ],
        "shifts": [
            {"code": "SHIFT-A-MORN", "name": "Morning Shift (06:00 - 14:00)", "starts_at": datetime.time(6, 0), "ends_at": datetime.time(14, 0), "grace_minutes": 15},
            {"code": "SHIFT-B-EVE", "name": "Evening Shift (14:00 - 22:00)", "starts_at": datetime.time(14, 0), "ends_at": datetime.time(22, 0), "grace_minutes": 15},
            {"code": "SHIFT-C-NIGHT", "name": "Night Shift (22:00 - 06:00)", "starts_at": datetime.time(22, 0), "ends_at": datetime.time(6, 0), "grace_minutes": 15},
            {"code": "SHIFT-GEN", "name": "General Office Shift", "starts_at": datetime.time(9, 0), "ends_at": datetime.time(17, 30), "grace_minutes": 15},
        ],
        "work_schedules": [
            {"name": "6-Day Factory Shift Schedule", "weekdays": [0, 1, 2, 3, 4, 5]},
        ],
        "attendance_policies": [
            {"name": "Factory Biometric Attendance Policy", "allowed_methods": ["biometric", "mobile"]},
        ],
        "employments": [
            {"person_code": f"EMP-M-{i:03d}", "employee_number": f"MFG-EMP-{i:03d}", "starts_on": datetime.date(2018 if i < 6 else 2020 if i < 14 else 2022, 2, 1)}
            for i in range(1, 19)
        ],
        "attendance_sessions": [
            {"person_code": "EMP-M-008", "work_date": datetime.date(2026, 10, 20), "status": "complete", "minutes_worked": 490},
            {"person_code": "EMP-M-009", "work_date": datetime.date(2026, 10, 20), "status": "complete", "minutes_worked": 483},
            {"person_code": "EMP-M-004", "work_date": datetime.date(2026, 10, 20), "status": "complete", "minutes_worked": 582},
            {"person_code": "EMP-M-013", "work_date": datetime.date(2026, 10, 20), "status": "complete", "minutes_worked": 510},
            {"person_code": "EMP-M-016", "work_date": datetime.date(2026, 10, 20), "status": "complete", "minutes_worked": 517},
            {"person_code": "EMP-M-018", "work_date": datetime.date(2026, 10, 20), "status": "complete", "minutes_worked": 498},
        ],
        "leave_policies": [
            {"name": "Casual Leave (CL)", "days_per_year": 10},
            {"name": "Sick Leave (SL)", "days_per_year": 10},
            {"name": "Factory Earned Leave (EL)", "days_per_year": 21},
        ],
        "leave_requests": [
            {"person_code": "EMP-M-009", "policy_name": "Casual Leave (CL)", "starts_on": datetime.date(2026, 10, 14), "ends_on": datetime.date(2026, 10, 15), "reason": "Agricultural harvest Satara", "status": "approved", "approver_code": "EMP-M-004"},
            {"person_code": "EMP-M-005", "policy_name": "Factory Earned Leave (EL)", "starts_on": datetime.date(2026, 11, 4), "ends_on": datetime.date(2026, 11, 7), "reason": "Diwali festival", "status": "pending", "approver_code": "EMP-M-003"},
        ],
        "salary_structure_name": "Industrial Manufacturing CTC Structure",
        "ctc_map": ctc_map,
        "onboarding_tasks": [
            {"person_code": "EMP-M-018", "title": "Plant Safety PPE Kit & Shoes Allocation", "category": "it_setup"},
            {"person_code": "EMP-M-018", "title": "Machine Safety Interlock Training & Signoff", "category": "compliance"},
        ],
        "hr_requests": [
            {"person_code": "EMP-M-008", "subject": "Request for replacement safety shoes size 9", "category": "equipment", "priority": "medium"},
        ],
    }
    seed_hrms(company, owner_user, hrms_spec, people_map, departments_map, stats)

    # 11. Projects & Work Management
    projects_spec = {
        "settings": {"task_id_prefix": "MFG"},
        "projects": [
            {
                "code": "PRJ-MFG-01",
                "name": "Chakan Plant CNC Line 3 Expansion",
                "description": "Installation and commissioning of Mazak 5-axis machining center for transmission flanges",
                "status": pm.ProjectStatus.ACTIVE,
                "priority": pm.ProjectPriority.HIGH,
                "owner_code": "EMP-M-004",
                "pm_code": "EMP-M-004",
                "unit_code": "OU-MFG-PUN",
                "budget_amount": Decimal("14500000.00"),
                "progress_percentage": 72,
                "is_billable": False,
                "members": [
                    {"person_code": "EMP-M-002", "role": pm.MemberRole.LEAD},
                    {"person_code": "EMP-M-004", "role": pm.MemberRole.MANAGER},
                    {"person_code": "EMP-M-005", "role": pm.MemberRole.CONTRIBUTOR},
                    {"person_code": "EMP-M-007", "role": pm.MemberRole.CONTRIBUTOR},
                    {"person_code": "EMP-M-016", "role": pm.MemberRole.REVIEWER},
                ],
            },
            {
                "code": "PRJ-MFG-02",
                "name": "ISO 9001:2015 & IATF 16949 Recertification",
                "description": "Plant-wide quality audit preparation and calibration records overhaul",
                "status": pm.ProjectStatus.ACTIVE,
                "priority": pm.ProjectPriority.URGENT,
                "owner_code": "EMP-M-006",
                "pm_code": "EMP-M-006",
                "unit_code": "OU-MFG-QA",
                "budget_amount": Decimal("2400000.00"),
                "progress_percentage": 85,
                "is_billable": False,
                "members": [
                    {"person_code": "EMP-M-006", "role": pm.MemberRole.MANAGER},
                    {"person_code": "EMP-M-016", "role": pm.MemberRole.CONTRIBUTOR},
                ],
            },
            {
                "code": "PRJ-MFG-03",
                "name": "Aerospace Titanium Machining Pilot",
                "description": "Trial machining of Ti-6Al-4V turbine stator components",
                "status": pm.ProjectStatus.PLANNING,
                "priority": pm.ProjectPriority.MEDIUM,
                "owner_code": "EMP-M-003",
                "pm_code": "EMP-M-003",
                "unit_code": "OU-MFG-PRD",
                "budget_amount": Decimal("6500000.00"),
                "progress_percentage": 15,
                "is_billable": True,
                "members": [
                    {"person_code": "EMP-M-003", "role": pm.MemberRole.MANAGER},
                    {"person_code": "EMP-M-005", "role": pm.MemberRole.CONTRIBUTOR},
                ],
            },
        ],
        "milestones": [
            {"key": "M1-CNC3", "project_code": "PRJ-MFG-01", "title": "Civil Foundation & Power Cabling", "due_date": datetime.date(2026, 5, 30), "status": pm.MilestoneStatus.ACHIEVED, "order": 1},
            {"key": "M2-CNC3", "project_code": "PRJ-MFG-01", "title": "Machine Delivery & Rigging Mazak 5-Axis", "due_date": datetime.date(2026, 8, 15), "status": pm.MilestoneStatus.ACHIEVED, "order": 2},
            {"key": "M3-CNC3", "project_code": "PRJ-MFG-01", "title": "Tooling Calibration & Trial Batch Run", "due_date": datetime.date(2026, 11, 15), "status": pm.MilestoneStatus.IN_PROGRESS, "order": 3},
        ],
        "tasks": [
            {
                "code": "TSK-MFG-101",
                "project_code": "PRJ-MFG-01",
                "milestone_key": "M2-CNC3",
                "title": "Level and anchor Mazak VTC-800 machine bed to 0.005mm tolerance",
                "description": "Use precision spirit level and anchor epoxy grouting.",
                "status": pm.TaskStatus.COMPLETED,
                "priority": pm.TaskPriority.HIGH,
                "assignee_code": "EMP-M-007",
                "reviewer_code": "EMP-M-004",
                "estimated_hours": Decimal("40.00"),
                "actual_hours": Decimal("38.00"),
            },
            {
                "code": "TSK-MFG-102",
                "project_code": "PRJ-MFG-01",
                "milestone_key": "M3-CNC3",
                "title": "Program Fanuc CNC macro subroutines for hydraulic manifold roughing",
                "description": "Optimize 5-axis helical milling to reduce cycle time by 14%.",
                "status": pm.TaskStatus.IN_PROGRESS,
                "priority": pm.TaskPriority.HIGH,
                "assignee_code": "EMP-M-005",
                "reviewer_code": "EMP-M-004",
                "estimated_hours": Decimal("35.00"),
                "actual_hours": Decimal("24.00"),
            },
            {
                "code": "TSK-MFG-103",
                "project_code": "PRJ-MFG-01",
                "milestone_key": "M3-CNC3",
                "title": "Run 50-piece pilot batch on EN8 alloy steel and log CMM deviations",
                "description": "Verify geometric tolerances on Zeiss CMM.",
                "status": pm.TaskStatus.TODO,
                "priority": pm.TaskPriority.URGENT,
                "assignee_code": "EMP-M-016",
                "reviewer_code": "EMP-M-006",
                "estimated_hours": Decimal("20.00"),
                "actual_hours": Decimal("0.00"),
            },
        ],
        "time_entries": [
            {
                "project_code": "PRJ-MFG-01",
                "task_code": "TSK-MFG-102",
                "person_code": "EMP-M-005",
                "approver_code": "EMP-M-004",
                "work_date": datetime.date(2026, 10, 20),
                "duration_minutes": 480,
                "description": "Optimized toolpaths in Mastercam for 5-axis helical milling.",
                "status": pm.TimesheetStatus.APPROVED,
            },
        ],
    }
    seed_projects(company, owner_user, projects_spec, people_map, departments_map, stats)

    # 12. CRM Domain Data
    crm_spec = {
        "accounts": [
            {"name": "Tata Motors Commercial Vehicle Div", "party_name": "Tata Motors Limited"},
            {"name": "Bharat Heavy Forgings Limited", "party_name": "Bharat Heavy Forgings Limited"},
            {"name": "Mahindra Precision Systems", "party_name": "Mahindra Precision Systems"},
        ],
        "contacts": [
            {"email": "rajesh.gokhale@tatamotors.example", "party_name": "Tata Motors Limited", "account_name": "Tata Motors Commercial Vehicle Div", "first_name": "Rajesh", "last_name": "Gokhale"},
            {"email": "k.venkataraman@bhforgings.example", "party_name": "Bharat Heavy Forgings Limited", "account_name": "Bharat Heavy Forgings Limited", "first_name": "K.", "last_name": "Venkataraman"},
            {"email": "milind.tambe@mahindra.example", "party_name": "Mahindra Precision Systems", "account_name": "Mahindra Precision Systems", "first_name": "Milind", "last_name": "Tambe"},
        ],
        "leads": [
            {"title": "Commercial EV Motor Housing Subcontract", "party_name": "Tata Motors Limited", "status": crm_m.LeadStatus.QUALIFIED, "email": "procurement@tatamotors.example"},
        ],
        "opportunities": [
            {"account_name": "Tata Motors Commercial Vehicle Div", "name": "Tata Motors — EV Gearbox Aluminum Housing Machining", "stage": crm_m.OpportunityStage.NEGOTIATION, "amount_minor": 1800000000},
            {"account_name": "Bharat Heavy Forgings Limited", "name": "Bharat Heavy Forgings — High-Pressure Flange Subcontract", "stage": crm_m.OpportunityStage.WON, "amount_minor": 950000000},
            {"account_name": "Mahindra Precision Systems", "name": "Mahindra Precision — Tractor Transmission Spline Shafts", "stage": crm_m.OpportunityStage.PROPOSAL, "amount_minor": 1200000000},
        ],
    }
    seed_crm(company, owner_user, crm_spec, parties_map, stats)

    return {"company": company, "owner": owner_user, "stats": stats}
