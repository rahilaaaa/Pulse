# Generic Custom Fields and Entities Baseline
---

## Person (5)

| Field | Suggested key | Type | Options / notes |
| --- | --- | --- | --- |
| Employee ID | `employee-id` | Text | e.g. `EMP-1024` |
| Date of joining | `date-of-joining` | Date | `YYYY-MM-DD` |
| Employment type | `employment-type` | Select | Full-time, Contract, Intern |
| Personal phone | `personal-phone` | Phone | Indian mobile validation OK (`indian_mobile`) |
| Skills | `skills` | Multi-select | Python, React, Sales, HR, Finance *(extend per tenant)* |

**Optional 6th:** Manager → Link → Person (`config.target: person`, `multiple: false`)

---

## Organization unit (5)

| Field | Suggested key | Type | Options / notes |
| --- | --- | --- | --- |
| Cost center code | `cost-center-code` | Text | e.g. `CC-FIN-01` |
| Floor / location | `floor-location` | Text | e.g. Floor 3 · Block B |
| Headcount budget | `headcount-budget` | Number | Planned seats (prefer `integer_only`) |
| Unit type tag | `unit-type-tag` | Select | HQ, Branch, Remote, Support |
| Active from | `active-from` | Date | When the unit started |

Built-in unit fields (do not duplicate as custom fields): name, key, parent, unit type, manager, status, description.

---

## Company (5)

| Field | Suggested key | Type | Options / notes |
| --- | --- | --- | --- |
| Industry | `industry` | Select | Technology, Manufacturing, Retail, Services, Other |
| Company size | `company-size` | Select | 1-10, 11-50, 51-200, 201-1000, 1000+ |
| Website | `website` | URL | |
| Founded year | `founded-year` | Number | Integer |
| About | `about` | Long text | Short description |

**Useful extras (not in the core 5):**

| Field | Suggested key | Type |
| --- | --- | --- |
| Support email | `support-email` | Email |
| WhatsApp business | `whatsapp-business` | Phone |

Built-in company fields (do not duplicate): display name, legal name, slug, status, country, timezone.

---

## Invitation (5)

| Field | Suggested key | Type | Options / notes |
| --- | --- | --- | --- |
| Invite reason | `invite-reason` | Select | New hire, Contractor, Partner, Other |
| Start date | `start-date` | Date | Planned first day |
| Suggested role | `suggested-role` | Text | Informal label only — **not** a real `CompanyRole` |
| Onboarding buddy email | `onboarding-buddy-email` | Email | |
| Welcome note | `welcome-note` | Long text | |

**Note:** Accepting an invitation does **not** copy invitation `custom_data` onto Person or Membership. App roles are assigned on membership after join.

---

## Membership (5)

| Field | Suggested key | Type | Options / notes |
| --- | --- | --- | --- |
| Access level note | `access-level-note` | Select | Standard, Elevated, Temporary |
| Probation end date | `probation-end-date` | Date | |
| Desk / seat | `desk-seat` | Text | e.g. `A-12` |
| Preferred language | `preferred-language` | Select | English, Hindi, Malayalam, Other |
| Internal notes | `internal-notes` | Long text | Prefer **sensitive** |

Job title stays on Person. Application permissions stay on membership roles (Owner, Administrator, HR Manager, Department Manager, Employee).

---

## Custom entities (5) — good for every company

| Entity | Key | Core fields |
| --- | --- | --- |
| Company Assets | `company-assets` | Asset tag (Text, **primary**), Category (Select: Laptop, Phone, Monitor, Other), Serial number (Text), Status (Select: In use, In storage, Retired), Purchase date (Date) |

| Vendors | `vendors` | Vendor name (Text, **primary**), Category (Select: IT, Facilities, Marketing, Other), Contact email (Email), Phone (Phone), Contract end (Date) |

| Projects | `projects` | Project code (Text, **primary**), Title (Text), Status (Select: Planned, Active, On hold, Done), Start date (Date), Budget (Number, INR) |

| Office Locations | `office-locations` | Location code (Text, **primary**), City (Text), Address (Long text), Seats (Number), Opened on (Date) |

| Contracts | `contracts` | Contract ID (Text, **primary**), Counterparty (Text), Type (Select: NDA, MSA, SOW, Lease), Expiry date (Date), Value (Number, INR) |

Pulse has no currency field type — store INR amounts as **Number**. Mark list/search labels with `is_primary` on a text field.

### Optional links (add after related data exists)

| Entity | Field | Link target |
| --- | --- | --- |
| Company Assets | Assigned employee | Person (`multiple: false`) |
| Projects | Owning unit | Organization unit (`multiple: false`) |
| Projects | Owner | Person (`multiple: false`) |
| Contracts | Linked vendor | Custom entity → `vendors` (`entity_id` required, `multiple: false`) |

---

## Configuration tips

1. Create **field definitions** before entering values.
2. Create **custom entities and their fields** before records.
3. Add **reference (Link)** fields only after target people, units, or entities exist (or create the field first, then fill values later).
4. Mark filters with `filterable` only where the UI/API supports filtering (custom entity records support `filter.<key>` today).
5. Keep this baseline identical across demo tenants; layer industry fields on top in industry-specific docs under `docs/demo-data/`.

## Related docs

- Industry demos: `01-technology-company.md`, `02-manufacturing-company.md`, `03-retail-company.md`
- Architecture: `docs/architecture/13-dynamic-data-model.md`
- Earlier scratch notes: `docs/architecture/14-company_dummy_datas`



1. Two divisions
Unit name	Unit type	Parent unit
Administration Division	Division	None
Operations Division	Division	None

2. Three branches
Unit name	Unit type	Parent unit
Kochi Branch	Department	Administration Division
Bengaluru Branch	Department	Operations Division
Kozhikode Branch	Department	Operations Division

Unit name	Unit type	Parent unit
Human Resources Team	Team	Kochi Branch
Finance Team	Team	Kochi Branch
IT Support Team	Team	Bengaluru Branch
Sales & Marketing Team	Team	Bengaluru Branch
Customer Support Team	Team	Kozhikode Branch
