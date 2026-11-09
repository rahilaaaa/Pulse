from __future__ import annotations

import datetime
from decimal import Decimal

from apps.parties.models import PartyKind
import apps.projects.models as pm
import apps.commerce.models as comm_m

from .base import (
    StatsCollector,
    ensure_base_catalogs,
    install_company_modules,
    seed_commerce,
    seed_company,
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

SLUG = "lotus-lane"
OWNER_EMAIL = "meera.krishnan@lotuslane.example"


def seed_retail_company(password: str = "a-long-passphrase", stats: StatsCollector = None) -> dict:
    if stats is None:
        stats = StatsCollector()

    ensure_base_catalogs(stats)

    # 1. Owner User & Company
    owner_user = seed_owner_user(OWNER_EMAIL, "Meera", "Krishnan", password, stats)

    company_spec = {
        "slug": SLUG,
        "display_name": "Lotus Lane",
        "legal_name": "Lotus Lane Retail Private Limited",
        "plan_code": "growth",
        "billing_interval": "month",
        "billing_profile": {
            "legal_name": "Lotus Lane Retail Private Limited",
            "billing_email": "accounts@lotuslane.example",
            "country_code": "IN",
            "tax_id": "27AABCL9876M1Z8",
            "address_line1": "Peninsula Business Park, 3rd Floor, Lower Parel",
            "city": "Mumbai",
            "state_code": "MH",
            "postal_code": "400013",
        },
    }
    company = seed_company(company_spec, owner_user, stats)

    # 2. Custom Fields
    custom_fields_spec = [
        {"entity": "person", "key": "store-shift", "label": "Store Shift", "field_type": "select", "options": ["Morning Store Shift", "Evening Store Shift", "General Office"]},
        {"entity": "person", "key": "sales-incentive-tier", "label": "Sales Incentive Tier", "field_type": "text"},
        {"entity": "organization_unit", "key": "store-sqft", "label": "Store Retail Carpet Area", "field_type": "number"},
        {"entity": "organization_unit", "key": "pos-terminals-count", "label": "POS Terminals Count", "field_type": "number"},
    ]
    seed_custom_fields(company, custom_fields_spec, stats)

    # 3. Unit Types & Departments
    types_spec = [
        {"key": "division", "name": "Division", "level": 1},
        {"key": "region", "name": "Geographic Region", "level": 2},
        {"key": "store", "name": "Retail Store", "level": 3},
        {"key": "department", "name": "Department", "level": 4},
    ]
    units_spec = [
        {"code": "OU-RET-HQ", "name": "Corporate HQ Mumbai", "unit_type_key": "division"},
        {"code": "OU-RET-OPS", "name": "Retail Store Operations", "unit_type_key": "division", "parent_code": "OU-RET-HQ"},
        {"code": "OU-RET-BAN", "name": "Bandra Flagship Store", "unit_type_key": "store", "parent_code": "OU-RET-OPS", "custom_data": {"store-sqft": 3200, "pos-terminals-count": 3}},
        {"code": "OU-RET-BLR", "name": "Indiranagar High Street Store", "unit_type_key": "store", "parent_code": "OU-RET-OPS", "custom_data": {"store-sqft": 2800, "pos-terminals-count": 2}},
        {"code": "OU-RET-COK", "name": "Kochi Boutique Store", "unit_type_key": "store", "parent_code": "OU-RET-OPS", "custom_data": {"store-sqft": 2200, "pos-terminals-count": 2}},
        {"code": "OU-RET-ECOM", "name": "Digital E-Commerce & D2C", "unit_type_key": "department", "parent_code": "OU-RET-HQ"},
    ]
    departments_map = seed_unit_types_and_departments(company, types_spec, units_spec, stats)

    # 4. People (15 people)
    people_spec = [
        {"code": "EMP-R-001", "first_name": "Meera", "last_name": "Krishnan", "work_email": "meera.krishnan@lotuslane.example", "job_title": "Founder & Chief Executive Officer", "department_code": "OU-RET-HQ"},
        {"code": "EMP-R-002", "first_name": "Rohit", "last_name": "Nambiar", "work_email": "rohit.nambiar@lotuslane.example", "job_title": "Head of Retail Operations", "department_code": "OU-RET-OPS", "manages_unit_code": "OU-RET-OPS"},
        {"code": "EMP-R-003", "first_name": "Tara", "last_name": "Sen", "work_email": "tara.sen@lotuslane.example", "job_title": "Creative & Merchandising Director", "department_code": "OU-RET-HQ"},
        {"code": "EMP-R-004", "first_name": "Vikram", "last_name": "Singhania", "work_email": "vikram.singhania@lotuslane.example", "job_title": "Store General Manager", "department_code": "OU-RET-BAN", "manages_unit_code": "OU-RET-BAN", "custom_data": {"store-shift": "Morning Store Shift"}},
        {"code": "EMP-R-005", "first_name": "Arjun", "last_name": "Kapoor", "work_email": "arjun.kapoor@lotuslane.example", "job_title": "Store General Manager", "department_code": "OU-RET-BLR", "manages_unit_code": "OU-RET-BLR", "custom_data": {"store-shift": "Morning Store Shift"}},
        {"code": "EMP-R-006", "first_name": "Priya", "last_name": "Nair", "work_email": "priya.nair@lotuslane.example", "job_title": "Store General Manager", "department_code": "OU-RET-COK", "manages_unit_code": "OU-RET-COK", "custom_data": {"store-shift": "Morning Store Shift"}},
        {"code": "EMP-R-007", "first_name": "Natasha", "last_name": "D'souza", "work_email": "natasha.dsouza@lotuslane.example", "job_title": "Senior Fashion & Living Stylist", "department_code": "OU-RET-BAN", "custom_data": {"store-shift": "Morning Store Shift"}},
        {"code": "EMP-R-008", "first_name": "Rahul", "last_name": "Shetty", "work_email": "rahul.shetty@lotuslane.example", "job_title": "Senior Fashion & Living Stylist", "department_code": "OU-RET-BLR", "custom_data": {"store-shift": "Evening Store Shift"}},
        {"code": "EMP-R-009", "first_name": "Ananya", "last_name": "Hegde", "work_email": "ananya.hegde@lotuslane.example", "job_title": "Head of People Operations", "department_code": "OU-RET-HQ"},
        {"code": "EMP-R-010", "first_name": "Farhan", "last_name": "Merchant", "work_email": "farhan.merchant@lotuslane.example", "job_title": "Finance & Commercial Manager", "department_code": "OU-RET-HQ"},
        {"code": "EMP-R-011", "first_name": "Shalini", "last_name": "Menon", "work_email": "shalini.menon@lotuslane.example", "job_title": "Retail Sales Associate", "department_code": "OU-RET-COK", "custom_data": {"store-shift": "Evening Store Shift"}},
        {"code": "EMP-R-012", "first_name": "Devendra", "last_name": "Rathore", "work_email": "devendra.rathore@lotuslane.example", "job_title": "Store Inventory & Stock Executive", "department_code": "OU-RET-BAN"},
        {"code": "EMP-R-013", "first_name": "Alisha", "last_name": "Khan", "work_email": "alisha.khan@lotuslane.example", "job_title": "Visual Merchandising Specialist", "department_code": "OU-RET-HQ"},
        {"code": "EMP-R-014", "first_name": "Joseph", "last_name": "Kurien", "work_email": "joseph.kurien@lotuslane.example", "job_title": "Chief Store Cashier", "department_code": "OU-RET-COK"},
        {"code": "EMP-R-015", "first_name": "Preeti", "last_name": "Desai", "work_email": "preeti.desai@lotuslane.example", "job_title": "Retail Sales Associate", "department_code": "OU-RET-BLR", "custom_data": {"store-shift": "Morning Store Shift"}},
    ]
    people_map = seed_people(company, owner_user, people_spec, departments_map, stats)

    # 5. Users and Memberships
    users_spec = [
        {"email": "meera.krishnan@lotuslane.example", "name": "Meera Krishnan", "person_code": "EMP-R-001", "role_slug": "owner", "is_owner": True},
        {"email": "rohit.nambiar@lotuslane.example", "name": "Rohit Nambiar", "person_code": "EMP-R-002", "role_slug": "department_manager"},
        {"email": "tara.sen@lotuslane.example", "name": "Tara Sen", "person_code": "EMP-R-003", "role_slug": "department_manager"},
        {"email": "vikram.singhania@lotuslane.example", "name": "Vikram Singhania", "person_code": "EMP-R-004", "role_slug": "department_manager"},
        {"email": "arjun.kapoor@lotuslane.example", "name": "Arjun Kapoor", "person_code": "EMP-R-005", "role_slug": "department_manager"},
        {"email": "priya.nair@lotuslane.example", "name": "Priya Nair", "person_code": "EMP-R-006", "role_slug": "department_manager"},
        {"email": "ananya.hegde@lotuslane.example", "name": "Ananya Hegde", "person_code": "EMP-R-009", "role_slug": "hr_manager"},
        {"email": "natasha.dsouza@lotuslane.example", "name": "Natasha D'souza", "person_code": "EMP-R-007", "role_slug": "employee"},
    ]
    memberships_map = seed_users_and_memberships(company, owner_user, users_spec, people_map, password, stats)

    # 6. Invitations
    invitations_spec = [
        {"email": "vm.stylist@freelance-design.example", "status": "pending", "custom_data": {"role": "Guest Window Stylist"}},
    ]
    seed_invitations(company, owner_user, invitations_spec, stats)

    # 7. Parties
    parties_spec = [
        {"name": "Arundhati Roychowdhury", "kind": PartyKind.PERSON},
        {"name": "The Taj Mahal Palace Boutique", "kind": PartyKind.ORGANIZATION},
        {"name": "Kabir Mehta", "kind": PartyKind.PERSON},
        {"name": "Maheshwar Handloom Weavers Society", "kind": PartyKind.ORGANIZATION},
        {"name": "FabIndia Artisans Cooperative", "kind": PartyKind.ORGANIZATION},
    ]
    parties_map = seed_parties(company, parties_spec, stats)

    # 8. Custom Entities
    entities_spec = [
        {
            "slug": "retail-stores",
            "name": "Retail Stores",
            "description": "Store locations, operating hours and managers",
            "fields": [
                {"key": "store-id", "label": "Store ID", "field_type": "text", "required": True, "is_primary": True},
                {"key": "city", "label": "City", "field_type": "text", "required": True},
                {"key": "manager", "label": "Store Manager", "field_type": "reference", "config": {"target": "person", "multiple": False}},
            ],
        },
    ]
    records_spec = [
        {"entity_slug": "retail-stores", "lookup_key": "STR-BAN", "data": {"store-id": "STR-BAN", "city": "Mumbai", "manager": "EMP-R-004"}},
        {"entity_slug": "retail-stores", "lookup_key": "STR-BLR", "data": {"store-id": "STR-BLR", "city": "Bengaluru", "manager": "EMP-R-005"}},
        {"entity_slug": "retail-stores", "lookup_key": "STR-COK", "data": {"store-id": "STR-COK", "city": "Kochi", "manager": "EMP-R-006"}},
    ]
    seed_custom_entities(company, owner_user, entities_spec, records_spec, people_map, departments_map, stats)

    # 9. Install Modules (hrms, projects, commerce)
    install_company_modules(company, owner_user, ["hrms", "projects", "commerce"], stats)

    # 10. HRMS Domain Data
    ctc_map = {
        "EMP-R-001": Decimal("400000.00"),
        "EMP-R-002": Decimal("216666.67"),
        "EMP-R-003": Decimal("200000.00"),
        "EMP-R-004": Decimal("108333.33"),
        "EMP-R-005": Decimal("104166.67"),
        "EMP-R-006": Decimal("91666.67"),
        "EMP-R-007": Decimal("60000.00"),
        "EMP-R-008": Decimal("56666.67"),
        "EMP-R-009": Decimal("150000.00"),
        "EMP-R-010": Decimal("133333.33"),
        "EMP-R-011": Decimal("35000.00"),
        "EMP-R-012": Decimal("40000.00"),
        "EMP-R-013": Decimal("66666.67"),
        "EMP-R-014": Decimal("33333.33"),
        "EMP-R-015": Decimal("35000.00"),
    }
    hrms_spec = {
        "legal_entity": {"code": "LE-RET-01", "name": "Lotus Lane Retail Private Limited"},
        "work_locations": [
            {"code": "LOC-BOM-HQ", "name": "Lower Parel Corporate Office", "address": {"city": "Mumbai", "state": "Maharashtra"}},
            {"code": "LOC-BAN-STR", "name": "Bandra Flagship Store", "address": {"city": "Mumbai", "state": "Maharashtra"}},
            {"code": "LOC-BLR-STR", "name": "Indiranagar High Street Store", "address": {"city": "Bengaluru", "state": "Karnataka"}},
            {"code": "LOC-COK-STR", "name": "Kochi Boutique Store", "address": {"city": "Kochi", "state": "Kerala"}},
        ],
        "designations": [
            {"code": "DES-CEO", "name": "Founder & Chief Executive Officer"},
            {"code": "DES-OPS-HEAD", "name": "Head of Retail Operations"},
            {"code": "DES-MERCH-DIR", "name": "Creative & Merchandising Director"},
            {"code": "DES-STORE-MGR", "name": "Store General Manager"},
            {"code": "DES-SR-STYLIST", "name": "Senior Fashion & Living Stylist"},
            {"code": "DES-SALES-ASSOC", "name": "Retail Sales Associate"},
            {"code": "DES-HR-HEAD", "name": "Head of People Operations"},
            {"code": "DES-VM-LEAD", "name": "Visual Merchandising Specialist"},
        ],
        "shifts": [
            {"code": "SHIFT-STR-MORN", "name": "Store Morning Shift (09:30 - 18:30)", "starts_at": datetime.time(9, 30), "ends_at": datetime.time(18, 30), "grace_minutes": 20},
            {"code": "SHIFT-STR-EVE", "name": "Store Evening Shift (12:30 - 21:30)", "starts_at": datetime.time(12, 30), "ends_at": datetime.time(21, 30), "grace_minutes": 20},
            {"code": "SHIFT-HQ-GEN", "name": "Corporate Office Shift", "starts_at": datetime.time(10, 0), "ends_at": datetime.time(19, 0), "grace_minutes": 15},
        ],
        "work_schedules": [
            {"name": "Rotating 6-Day Retail Roster", "weekdays": [0, 1, 2, 3, 4, 5]},
        ],
        "attendance_policies": [
            {"name": "Retail Geofenced Attendance Policy", "allowed_methods": ["mobile"]},
        ],
        "employments": [
            {"person_code": f"EMP-R-{i:03d}", "employee_number": f"LL-EMP-{i:03d}", "starts_on": datetime.date(2021 if i < 5 else 2022 if i < 11 else 2023, 3, 1)}
            for i in range(1, 16)
        ],
        "attendance_sessions": [
            {"person_code": "EMP-R-004", "work_date": datetime.date(2026, 10, 20), "status": "complete", "minutes_worked": 540},
            {"person_code": "EMP-R-007", "work_date": datetime.date(2026, 10, 20), "status": "complete", "minutes_worked": 540},
            {"person_code": "EMP-R-005", "work_date": datetime.date(2026, 10, 20), "status": "complete", "minutes_worked": 540},
            {"person_code": "EMP-R-008", "work_date": datetime.date(2026, 10, 20), "status": "complete", "minutes_worked": 540},
            {"person_code": "EMP-R-006", "work_date": datetime.date(2026, 10, 20), "status": "complete", "minutes_worked": 540},
            {"person_code": "EMP-R-011", "work_date": datetime.date(2026, 10, 20), "status": "complete", "minutes_worked": 540},
        ],
        "leave_policies": [
            {"name": "Casual Leave (CL)", "days_per_year": 12},
            {"name": "Sick Leave (SL)", "days_per_year": 10},
            {"name": "Store Privilege Leave (PL)", "days_per_year": 18},
        ],
        "leave_requests": [
            {"person_code": "EMP-R-011", "policy_name": "Casual Leave (CL)", "starts_on": datetime.date(2026, 10, 19), "ends_on": datetime.date(2026, 10, 19), "reason": "Family function Thrissur", "status": "approved", "approver_code": "EMP-R-006"},
            {"person_code": "EMP-R-007", "policy_name": "Store Privilege Leave (PL)", "starts_on": datetime.date(2026, 11, 12), "ends_on": datetime.date(2026, 11, 14), "reason": "Post-Diwali holiday", "status": "pending", "approver_code": "EMP-R-004"},
        ],
        "salary_structure_name": "Retail Storefront Compensation Structure",
        "ctc_map": ctc_map,
        "onboarding_tasks": [
            {"person_code": "EMP-R-015", "title": "Store POS Billing & Barcode Scanner Training", "category": "it_setup"},
            {"person_code": "EMP-R-015", "title": "Customer Service & Brand Styling Standards", "category": "compliance"},
        ],
        "hr_requests": [
            {"person_code": "EMP-R-007", "subject": "Uniform and apron replacement request", "category": "equipment", "priority": "low"},
        ],
    }
    seed_hrms(company, owner_user, hrms_spec, people_map, departments_map, stats)

    # 11. Projects & Work Management
    projects_spec = {
        "settings": {"task_id_prefix": "LL"},
        "projects": [
            {
                "code": "PRJ-RET-01",
                "name": "Indiranagar Store Launch & Visual Merchandising",
                "description": "Store interior fitout, brass chandelier lighting setup and VIP launch gala",
                "status": pm.ProjectStatus.COMPLETED,
                "priority": pm.ProjectPriority.URGENT,
                "owner_code": "EMP-R-005",
                "pm_code": "EMP-R-005",
                "unit_code": "OU-RET-BLR",
                "budget_amount": Decimal("4500000.00"),
                "progress_percentage": 100,
                "is_billable": False,
                "members": [
                    {"person_code": "EMP-R-002", "role": pm.MemberRole.LEAD},
                    {"person_code": "EMP-R-005", "role": pm.MemberRole.MANAGER},
                    {"person_code": "EMP-R-013", "role": pm.MemberRole.CONTRIBUTOR},
                ],
            },
            {
                "code": "PRJ-RET-02",
                "name": "Festive Winter Collection 2026 Merchandising",
                "description": "Seasonal artisan collection display rollouts across Bandra, Indiranagar and Kochi",
                "status": pm.ProjectStatus.ACTIVE,
                "priority": pm.ProjectPriority.HIGH,
                "owner_code": "EMP-R-003",
                "pm_code": "EMP-R-003",
                "unit_code": "OU-RET-HQ",
                "budget_amount": Decimal("2800000.00"),
                "progress_percentage": 78,
                "is_billable": False,
                "members": [
                    {"person_code": "EMP-R-003", "role": pm.MemberRole.MANAGER},
                    {"person_code": "EMP-R-013", "role": pm.MemberRole.CONTRIBUTOR},
                ],
            },
            {
                "code": "PRJ-RET-03",
                "name": "Bandra Flagship Customer Experience Remodel",
                "description": "Bespoke trial room remodel, organic tea lounge and VIP private styling booth",
                "status": pm.ProjectStatus.PLANNING,
                "priority": pm.ProjectPriority.MEDIUM,
                "owner_code": "EMP-R-004",
                "pm_code": "EMP-R-004",
                "unit_code": "OU-RET-BAN",
                "budget_amount": Decimal("1800000.00"),
                "progress_percentage": 10,
                "is_billable": False,
                "members": [
                    {"person_code": "EMP-R-004", "role": pm.MemberRole.MANAGER},
                ],
            },
        ],
        "milestones": [
            {"key": "M1-IND", "project_code": "PRJ-RET-01", "title": "Store Fitout & Lighting Architecture Signoff", "due_date": datetime.date(2026, 3, 15), "status": pm.MilestoneStatus.ACHIEVED, "order": 1},
            {"key": "M2-IND", "project_code": "PRJ-RET-01", "title": "POS Hardware & Inventory Stocking", "due_date": datetime.date(2026, 5, 20), "status": pm.MilestoneStatus.ACHIEVED, "order": 2},
            {"key": "M3-IND", "project_code": "PRJ-RET-01", "title": "VIP Launch Gala & Press Preview", "due_date": datetime.date(2026, 6, 25), "status": pm.MilestoneStatus.ACHIEVED, "order": 3},
        ],
        "tasks": [
            {
                "code": "TSK-RET-201",
                "project_code": "PRJ-RET-02",
                "title": "Coordinate artisan handloom batch shipment from Maheshwar cluster",
                "description": "Receive 450 meters of handwoven pure silk-cotton textiles.",
                "status": pm.TaskStatus.COMPLETED,
                "priority": pm.TaskPriority.HIGH,
                "assignee_code": "EMP-R-003",
                "reviewer_code": "EMP-R-001",
                "estimated_hours": Decimal("25.00"),
                "actual_hours": Decimal("22.00"),
            },
            {
                "code": "TSK-RET-202",
                "project_code": "PRJ-RET-02",
                "title": "Design and produce festive window display props for Bandra & Indiranagar",
                "description": "Install antique brass lotus lanterns and handcrafted silk backdrop hangings.",
                "status": pm.TaskStatus.IN_PROGRESS,
                "priority": pm.TaskPriority.HIGH,
                "assignee_code": "EMP-R-013",
                "reviewer_code": "EMP-R-003",
                "estimated_hours": Decimal("35.00"),
                "actual_hours": Decimal("20.00"),
            },
            {
                "code": "TSK-RET-203",
                "project_code": "PRJ-RET-02",
                "title": "Create Instagram Lookbook & WhatsApp customer campaign assets",
                "description": "Curate lookbook images and draft promotional messaging.",
                "status": pm.TaskStatus.TODO,
                "priority": pm.TaskPriority.MEDIUM,
                "assignee_code": "EMP-R-013",
                "reviewer_code": "EMP-R-003",
                "estimated_hours": Decimal("16.00"),
                "actual_hours": Decimal("0.00"),
            },
        ],
        "time_entries": [
            {
                "project_code": "PRJ-RET-02",
                "task_code": "TSK-RET-202",
                "person_code": "EMP-R-013",
                "approver_code": "EMP-R-003",
                "work_date": datetime.date(2026, 10, 20),
                "duration_minutes": 420,
                "description": "Supervised installation of handmade brass lotus lamps and silk hangings in Bandra window.",
                "status": pm.TimesheetStatus.APPROVED,
            },
        ],
    }
    seed_projects(company, owner_user, projects_spec, people_map, departments_map, stats)

    # 12. Commerce Domain Data
    commerce_spec = {
        "products": [
            {"name": "Handcrafted Pure Linen Shirt (Indigo)", "sku": "LS-001", "price_minor": 450000, "status": comm_m.ProductStatus.ACTIVE},
            {"name": "Mulberry Silk Handprinted Floral Scarf", "sku": "SS-002", "price_minor": 280000, "status": comm_m.ProductStatus.ACTIVE},
            {"name": "Hand-Hammered Antique Brass Planter", "sku": "BP-003", "price_minor": 320000, "status": comm_m.ProductStatus.ACTIVE},
            {"name": "Organic Wild Jasmine Soy Wax Candle", "sku": "SC-004", "price_minor": 140000, "status": comm_m.ProductStatus.ACTIVE},
            {"name": "Studio Pottery Teapot & Cup Set (Terracotta)", "sku": "CP-005", "price_minor": 380000, "status": comm_m.ProductStatus.ACTIVE},
            {"name": "Handloom Woven Ikat Cotton Throw", "sku": "CT-006", "price_minor": 240000, "status": comm_m.ProductStatus.ACTIVE},
        ],
        "orders": [
            {
                "order_number": "ORD-RET-2026-001",
                "party_name": "Arundhati Roychowdhury",
                "status": comm_m.OrderStatus.PLACED,
                "currency": "INR",
                "total_minor": 1180000,
                "lines": [
                    {"sku": "LS-001", "quantity": 2, "unit_price_minor": 450000},
                    {"sku": "SS-002", "quantity": 1, "unit_price_minor": 280000},
                ],
            },
            {
                "order_number": "ORD-RET-2026-002",
                "party_name": "The Taj Mahal Palace Boutique",
                "status": comm_m.OrderStatus.PLACED,
                "currency": "INR",
                "total_minor": 5300000,
                "lines": [
                    {"sku": "BP-003", "quantity": 10, "unit_price_minor": 320000},
                    {"sku": "SC-004", "quantity": 15, "unit_price_minor": 140000},
                ],
            },
            {
                "order_number": "ORD-RET-2026-003",
                "party_name": "Kabir Mehta",
                "status": comm_m.OrderStatus.DRAFT,
                "currency": "INR",
                "total_minor": 380000,
                "lines": [
                    {"sku": "CP-005", "quantity": 1, "unit_price_minor": 380000},
                ],
            },
        ],
    }
    seed_commerce(company, owner_user, commerce_spec, parties_map, stats)

    return {"company": company, "owner": owner_user, "stats": stats}
