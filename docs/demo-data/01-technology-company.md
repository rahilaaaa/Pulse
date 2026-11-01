# Demo Data — Technology Company

Independent demo dataset for **Nimbus Labs Private Limited**, a Bengaluru SaaS company.
Use this document to configure custom fields, organization units, people, invitations, memberships, and custom entities in an isolated Pulse company workspace.

All emails use `@nimbuslabs.example`. Phone numbers are synthetic Indian mobiles (10 digits, starting 6–9). Dates are ISO `YYYY-MM-DD`. Money is INR stored as Pulse `number` fields (no currency type exists).

Demo IDs below are stable labels for documentation. In the application, Pulse generates UUIDs; map these labels when seeding or entering data manually.

---

## A. Company Profile

| Attribute | Value |
| --- | --- |
| Demo company ID | `CO-TECH-001` |
| Display name | Nimbus Labs |
| Legal name | Nimbus Labs Private Limited |
| Slug | `nimbus-labs` |
| Industry | Technology (SaaS / B2B software) |
| Company size | 51–200 |
| Website | `https://www.nimbuslabs.example` |
| Founded year | 2018 |
| About | Nimbus Labs builds cloud operations tooling for mid-market Indian enterprises. Product and engineering are based in Bengaluru; customer success runs from Kochi. |
| Support email | `support@nimbuslabs.example` |
| WhatsApp business | `9876501001` |
| Country / timezone | IN / Asia/Kolkata |
| Company status | `active` |
| Business locations | Bengaluru HQ (Koramangala); Kochi delivery centre (Infopark) |
| Approximate headcount | 48 employees in this demo (platform target band 51–200) |

Built-in company columns used: `display_name`, `legal_name`, `slug`, `status`, `country_code`, `timezone`. Profile attributes such as industry and website live in **company `custom_data`**, not first-class columns.

---

## B. Company Custom Fields

Configure on entity `company` for this tenant only (`CustomField.company` + `entity=company`).

| Field name | Key (suggested) | Type | Required | Options / config | Example value | Business purpose |
| --- | --- | --- | --- | --- | --- | --- |
| Industry | `industry` | select | yes | Technology, Manufacturing, Retail, Services, Other | Technology | Segment tenants in reports |
| Company size | `company-size` | select | no | 1-10, 11-50, 51-200, 201-1000, 1000+ | 51-200 | Rough scale |
| Website | `website` | url | no | — | `https://www.nimbuslabs.example` | Public site |
| Founded year | `founded-year` | number | no | validation: integer_only, min 1900, max 2100 | 2018 | Age of company |
| About | `about` | long_text | no | — | (see profile) | Short description |
| Support email | `support-email` | email | no | — | `support@nimbuslabs.example` | External support contact |
| WhatsApp business | `whatsapp-business` | phone | no | validation pattern `indian_mobile` | `9876501001` | Business WhatsApp |
| Primary product | `primary-product` | text | no | — | CloudOps Control Plane | Product focus for demos |
| Deployment model | `deployment-model` | select | no | SaaS, Hybrid, On-prem | SaaS | How customers consume the product |

Do **not** duplicate `display_name`, `legal_name`, `slug`, or `timezone` as custom fields (`RESERVED_KEYS` on company).

---

## C. Organization Structure and Units

### Capabilities used

- Model: `organization.Department` (API/UI: **organization unit**).
- Hierarchy: optional `parent` FK; cycle detection enforced.
- Unit types: company-scoped `OrganizationUnitType`. Defaults seeded as `division`, `department`, `team` when first listed.
- Built-in unit fields: `name`, `key`, `unit_type`, `parent`, `description`, `manager` (Person FK), `status`.
- Location, cost centre, floor, headcount budget, active-from → **organization_unit custom fields** (not built-in columns).
- Each **Person** has at most **one** `department` FK. Multi-unit membership is **not** supported.

### Suggested unit types (optional customization)

Keep defaults, or add:

| Key | Singular | Plural | Allowed parents |
| --- | --- | --- | --- |
| `division` | Division | Divisions | (none / root) |
| `department` | Department | Departments | `division` |
| `team` | Team | Teams | `department` |

### Hierarchy

```
Nimbus Labs (company)
├── Headquarters — Bengaluru          [division]   OU-TECH-HQ
│   ├── Engineering                   [department] OU-TECH-ENG
│   │   ├── Backend Platform          [team]       OU-TECH-BE
│   │   └── Frontend Experience       [team]       OU-TECH-FE
│   ├── Product                       [department] OU-TECH-PROD
│   ├── Human Resources               [department] OU-TECH-HR
│   └── Finance & Admin               [department] OU-TECH-FIN
└── Kochi Delivery Centre             [division]   OU-TECH-COK
    └── Customer Success              [department] OU-TECH-CS
```

### Organization unit custom fields

Entity `organization_unit`:

| Field name | Key | Type | Required | Options | Purpose |
| --- | --- | --- | --- | --- | --- |
| Cost center code | `cost-center-code` | text | no | — | Finance coding |
| Floor / location | `floor-location` | text | no | — | Desk / wing label |
| Headcount budget | `headcount-budget` | number | no | integer_only | Planned seats |
| Unit type tag | `unit-type-tag` | select | no | HQ, Branch, Remote, Support | Soft classification |
| Active from | `active-from` | date | no | — | When unit started |
| Engineering discipline | `engineering-discipline` | select | no | Backend, Frontend, Platform, Full-stack, N/A | Useful on eng teams |
| On-call team | `on-call-team` | boolean | no | — | Whether unit participates in on-call |

### Unit records

| Demo ID | Name | Type | Parent | Manager (person) | Headcount (approx) | Cost center | Floor / location | Headcount budget | Active from | Extra CF |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OU-TECH-HQ | Headquarters — Bengaluru | division | — | P-TECH-001 | 38 | CC-HQ-01 | Koramangala · Floors 4–5 | 50 | 2018-06-01 | tag HQ |
| OU-TECH-ENG | Engineering | department | OU-TECH-HQ | P-TECH-002 | 18 | CC-ENG-01 | Floor 5 · Block A | 22 | 2018-08-01 | discipline N/A |
| OU-TECH-BE | Backend Platform | team | OU-TECH-ENG | P-TECH-004 | 8 | CC-ENG-BE | Floor 5 · A2 | 10 | 2019-01-15 | Backend; on-call yes |
| OU-TECH-FE | Frontend Experience | team | OU-TECH-ENG | P-TECH-005 | 7 | CC-ENG-FE | Floor 5 · A3 | 9 | 2019-03-01 | Frontend; on-call no |
| OU-TECH-PROD | Product | department | OU-TECH-HQ | P-TECH-006 | 5 | CC-PROD-01 | Floor 4 · B1 | 6 | 2018-09-01 | — |
| OU-TECH-HR | Human Resources | department | OU-TECH-HQ | P-TECH-007 | 3 | CC-HR-01 | Floor 4 · B2 | 4 | 2018-07-01 | Support |
| OU-TECH-FIN | Finance & Admin | department | OU-TECH-HQ | P-TECH-008 | 3 | CC-FIN-01 | Floor 4 · B3 | 4 | 2018-07-01 | Support |
| OU-TECH-COK | Kochi Delivery Centre | division | — | P-TECH-009 | 10 | CC-COK-01 | Infopark · Building C | 14 | 2021-02-01 | Branch |
| OU-TECH-CS | Customer Success | department | OU-TECH-COK | P-TECH-010 | 8 | CC-CS-01 | Infopark · C2 | 10 | 2021-03-01 | Support |

### How people relate to units

- Assign each Person’s built-in `department` to exactly one unit (usually a team or leaf department).
- Unit `manager` is a Person reference on the unit; it does **not** automatically grant the Department Manager **application role**.
- Reporting manager for an employee can be modelled with Person custom field `manager` (reference → person, `multiple: false`) if needed; that is separate from unit manager and from roles.

---

## D. People and Employee Custom Fields

### Built-in Person fields

`first_name`, `last_name`, `work_email`, `job_title`, `status` (`active`/`inactive`), `department` (org unit), `custom_data`.

### Person custom fields

| Field name | Key | Type | Required | Options / config | Purpose |
| --- | --- | --- | --- | --- | --- |
| Employee ID | `employee-id` | text | yes | — | HR code |
| Date of joining | `date-of-joining` | date | yes | — | Tenure |
| Employment type | `employment-type` | select | yes | Full-time, Contract, Intern | Contract class |
| Personal phone | `personal-phone` | phone | no | indian_mobile | Personal contact |
| Skills | `skills` | multi_select | no | Python, React, TypeScript, DevOps, Sales, HR, Finance, Customer Success, Product | Capability tags (extended) |
| Manager | `manager` | reference | no | target `person`, multiple false | Reporting line |
| Primary technology | `primary-technology` | select | no | Python, TypeScript, Go, React, Kubernetes, N/A | Eng focus |
| GitHub profile | `github-profile` | url | no | — | Public profile link |
| Work mode | `work-mode` | select | no | Office, Hybrid, Remote | Attendance mode |

### Sample people (16)

| Emp ID | Name | Work email | Joined | Type | Phone | Skills | Org unit | Manager | Job title | Membership role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EMP-T-001 | Arjun Mehta | `arjun.mehta@nimbuslabs.example` | 2018-06-01 | Full-time | 9876501101 | Product, Sales | OU-TECH-HQ | — | Chief Executive Officer | Owner |
| EMP-T-002 | Kavya Nair | `kavya.nair@nimbuslabs.example` | 2018-08-15 | Full-time | 9876501102 | Python, DevOps | OU-TECH-ENG | EMP-T-001 | VP Engineering | Department Manager |
| EMP-T-003 | Rohan Iyer | `rohan.iyer@nimbuslabs.example` | 2019-01-10 | Full-time | 9876501103 | Finance | OU-TECH-FIN | EMP-T-001 | Head of Finance | Employee |
| EMP-T-004 | Meera Krishnan | `meera.krishnan@nimbuslabs.example` | 2019-02-01 | Full-time | 9876501104 | Python, DevOps | OU-TECH-BE | EMP-T-002 | Backend Tech Lead | Employee |
| EMP-T-005 | Aditya Rao | `aditya.rao@nimbuslabs.example` | 2019-04-01 | Full-time | 9876501105 | React, TypeScript | OU-TECH-FE | EMP-T-002 | Frontend Tech Lead | Employee |
| EMP-T-006 | Sneha Pillai | `sneha.pillai@nimbuslabs.example` | 2019-06-01 | Full-time | 9876501106 | Product | OU-TECH-PROD | EMP-T-001 | Head of Product | Employee |
| EMP-T-007 | Fatima Sheikh | `fatima.sheikh@nimbuslabs.example` | 2019-07-15 | Full-time | 9876501107 | HR | OU-TECH-HR | EMP-T-001 | HR Manager | HR Manager |
| EMP-T-008 | Vikram Desai | `vikram.desai@nimbuslabs.example` | 2020-01-06 | Full-time | 9876501108 | Finance | OU-TECH-FIN | EMP-T-003 | Accounts Executive | Employee |
| EMP-T-009 | Anjali Menon | `anjali.menon@nimbuslabs.example` | 2021-02-01 | Full-time | 9876501109 | Customer Success | OU-TECH-COK | EMP-T-001 | Centre Head — Kochi | Department Manager |
| EMP-T-010 | Nikhil Joseph | `nikhil.joseph@nimbuslabs.example` | 2021-03-15 | Full-time | 9876501110 | Customer Success, Sales | OU-TECH-CS | EMP-T-009 | CS Manager | Employee |
| EMP-T-011 | Priya Banerjee | `priya.banerjee@nimbuslabs.example` | 2020-08-01 | Full-time | 9876501111 | Python | OU-TECH-BE | EMP-T-004 | Senior Backend Engineer | Employee |
| EMP-T-012 | Harish Gupta | `harish.gupta@nimbuslabs.example` | 2021-09-01 | Full-time | 9876501112 | React, TypeScript | OU-TECH-FE | EMP-T-005 | Frontend Engineer | Employee |
| EMP-T-013 | Divya Thomas | `divya.thomas@nimbuslabs.example` | 2022-01-10 | Full-time | 9876501113 | Product | OU-TECH-PROD | EMP-T-006 | Product Manager | Employee |
| EMP-T-014 | Sameer Khan | `sameer.khan@nimbuslabs.example` | 2023-05-02 | Contract | 9876501114 | DevOps, Kubernetes | OU-TECH-BE | EMP-T-004 | DevOps Contractor | Employee |
| EMP-T-015 | Lakshmi Reddy | `lakshmi.reddy@nimbuslabs.example` | 2024-07-01 | Intern | 9876501115 | React | OU-TECH-FE | EMP-T-005 | Frontend Intern | Employee |
| EMP-T-016 | Jose Fernandez | `jose.fernandez@nimbuslabs.example` | 2022-11-01 | Full-time | 9876501116 | Customer Success | OU-TECH-CS | EMP-T-010 | Customer Success Specialist | Employee |

Person demo IDs: `P-TECH-001` … `P-TECH-016` map 1:1 to EMP-T-001 … EMP-T-016.

**Industry CF examples:** EMP-T-011 primary technology Python, GitHub `https://github.com/example-priya`, work mode Hybrid; EMP-T-014 work mode Remote; EMP-T-015 work mode Office.

**Separation of concerns:** job title is Person built-in; org unit is Person.`department`; Pulse role is MembershipRoleAssignment (`Owner`, `Administrator`, `HR Manager`, `Department Manager`, `Employee`). Being a unit manager does not imply Owner/Administrator.

---

## E. Invitations and Invitation Custom Fields

Invitation statuses in code: `pending`, `accepted`, `revoked`, `expired`.

Accepting an invitation sets `accepted_at` and creates/links membership + person; it does **not** copy invitation `custom_data` onto Person or Membership.

Roles are **not** selected on invite create; accept assigns the default member role (`employee`). Change roles later via membership role APIs.

### Invitation custom fields

| Field name | Key | Type | Required | Options |
| --- | --- | --- | --- | --- |
| Invite reason | `invite-reason` | select | no | New hire, Contractor, Partner, Other |
| Start date | `start-date` | date | no | — |
| Suggested role | `suggested-role` | text | no | Informal label only — not a CompanyRole FK |
| Onboarding buddy email | `onboarding-buddy-email` | email | no | — |
| Welcome note | `welcome-note` | long_text | no | — |

### Sample invitations (demo records — do not create real tokens)

| Demo ID | Email | Status | Reason | Start | Suggested role | Buddy | Welcome note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| INV-TECH-01 | `neha.shetty@nimbuslabs.example` | pending | New hire | 2026-11-03 | Employee | `meera.krishnan@nimbuslabs.example` | Welcome to Backend Platform |
| INV-TECH-02 | `contractor.ops@partner.example` | pending | Contractor | 2026-10-20 | Employee | `kavya.nair@nimbuslabs.example` | 3-month SRE contract |
| INV-TECH-03 | `partner.api@acmecloud.example` | revoked | Partner | 2026-09-01 | Employee | `sneha.pillai@nimbuslabs.example` | Integration partner access — revoked |
| INV-TECH-04 | `alumni.dev@nimbuslabs.example` | expired | Other | 2025-12-01 | Employee | `fatima.sheikh@nimbuslabs.example` | Rehire exploration — expired |
| INV-TECH-05 | `jose.fernandez@nimbuslabs.example` | accepted | New hire | 2022-11-01 | Employee | `nikhil.joseph@nimbuslabs.example` | CS hire (historical demo) |

---

## F. Memberships and Membership Custom Fields

Membership statuses: `invited`, `active`, `suspended`, `removed`. Active members link `user` ↔ `company` and optionally `person`.

### Membership custom fields

| Field name | Key | Type | Required | Options |
| --- | --- | --- | --- | --- |
| Access level note | `access-level-note` | select | no | Standard, Elevated, Temporary |
| Probation end date | `probation-end-date` | date | no | — |
| Desk / seat | `desk-seat` | text | no | — |
| Preferred language | `preferred-language` | select | no | English, Hindi, Malayalam, Other |
| Internal notes | `internal-notes` | long_text | no | sensitive recommended |

### Example memberships

| Person | App role(s) | Access level note | Probation end | Desk | Language | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| EMP-T-001 Arjun | Owner | Elevated | — | HQ-CEO | English | Founding owner |
| EMP-T-002 Kavya | Department Manager | Elevated | — | 5-A-01 | English | Eng leader; not Administrator |
| EMP-T-007 Fatima | HR Manager | Elevated | — | 4-B2-02 | Hindi | People ops |
| EMP-T-011 Priya | Employee | Standard | — | 5-A2-14 | English | IC |
| EMP-T-014 Sameer | Employee | Temporary | — | Remote | English | Contractor desk N/A |
| EMP-T-015 Lakshmi | Employee | Standard | 2026-12-31 | 5-A3-08 | English | Intern still in probation window |

---

## G. Custom Entities and Sample Records

All entities are company-scoped (`CustomEntity.company`). Keys are slugs. Records store flat JSON in `data`.

Reference fields may link to `person`, `organization_unit`, `role`, or another `custom_entity` (with `entity_id`).

### Entities chosen for technology

| Entity name | Key | Purpose |
| --- | --- | --- |
| Company Assets | `company-assets` | Laptops/phones inventory |
| Vendors | `vendors` | IT and facilities suppliers |
| Projects | `projects` | Delivery / product initiatives |
| Office Locations | `office-locations` | Physical sites |
| Software Environments | `software-environments` | Dev/stage/prod environments |
| Equipment Assignments | `equipment-assignments` | Asset ↔ person assignments |

Omit generic **Contracts** here to stay under cognitive load; manufacturing/retail demos cover contracts more heavily. Cap is 20 entities/company.

### 1. Company Assets (`company-assets`)

| Field | Key | Type | Required | Options / config | Primary? |
| --- | --- | --- | --- | --- | --- |
| Asset tag | `asset-tag` | text | yes | — | yes |
| Category | `category` | select | yes | Laptop, Phone, Monitor, Other | |
| Serial number | `serial-number` | text | no | — | |
| Status | `status` | select | yes | In use, In storage, Retired | filterable |
| Purchase date | `purchase-date` | date | no | — | |
| Operating system | `operating-system` | select | no | Windows, macOS, Linux, iOS, Android, N/A | |
| Assigned employee | `assigned-employee` | reference | no | person, multiple false | |

Sample records:

| Asset tag | Category | Serial | Status | Purchase | OS | Assigned |
| --- | --- | --- | --- | --- | --- | --- |
| AST-2026-001 | Laptop | SN-MBP-1001 | In use | 2024-03-12 | macOS | EMP-T-011 |
| AST-2026-002 | Laptop | SN-DL-2201 | In use | 2023-11-02 | Linux | EMP-T-004 |
| AST-2026-003 | Phone | SN-IP-3301 | In use | 2025-01-20 | iOS | EMP-T-001 |
| AST-2026-004 | Monitor | SN-MON-4401 | In storage | 2022-08-01 | N/A | — |
| AST-2026-005 | Laptop | SN-MBP-1009 | Retired | 2019-05-01 | macOS | — |

### 2. Vendors (`vendors`)

| Field | Key | Type | Req | Options |
| --- | --- | --- | --- | --- |
| Vendor name | `vendor-name` | text | yes | primary |
| Category | `category` | select | yes | IT, Facilities, Marketing, Other |
| Contact email | `contact-email` | email | no | |
| Phone | `phone` | phone | no | |
| Contract end | `contract-end` | date | no | |

Samples: CloudHost India (IT, `sales@cloudhost.example`, end 2027-03-31); Bengaluru Facilities Co (Facilities); DesignStudio South (Marketing).

### 3. Projects (`projects`)

| Field | Key | Type | Req | Options / config |
| --- | --- | --- | --- | --- |
| Project code | `project-code` | text | yes | primary |
| Title | `title` | text | yes | |
| Status | `status` | select | yes | Planned, Active, On hold, Done |
| Start date | `start-date` | date | no | |
| Budget | `budget` | number | no | INR amount |
| Owning unit | `owning-unit` | reference | no | organization_unit, multiple false |
| Project owner | `project-owner` | reference | no | person, multiple false |

Samples:

| Code | Title | Status | Start | Budget (INR) | Unit | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| PRJ-NL-01 | Control Plane v3 | Active | 2026-01-15 | 8500000 | OU-TECH-BE | EMP-T-004 |
| PRJ-NL-02 | Customer portal redesign | Active | 2026-04-01 | 3200000 | OU-TECH-FE | EMP-T-005 |
| PRJ-NL-03 | Payroll module spike | Planned | 2026-12-01 | 900000 | OU-TECH-PROD | EMP-T-006 |
| PRJ-NL-04 | Kochi CS playbooks | Done | 2025-02-01 | 450000 | OU-TECH-CS | EMP-T-010 |

### 4. Office Locations (`office-locations`)

| Field | Key | Type | Req |
| --- | --- | --- | --- |
| Location code | `location-code` | text | yes (primary) |
| City | `city` | text | yes |
| Address | `address` | long_text | no |
| Seats | `seats` | number | no |
| Opened on | `opened-on` | date | no |

Samples: `LOC-BLR` Bengaluru, 80 seats, 2018-06-01; `LOC-COK` Kochi, 24 seats, 2021-02-01.

### 5. Software Environments (`software-environments`)

| Field | Key | Type | Req | Options |
| --- | --- | --- | --- | --- |
| Environment name | `environment-name` | text | yes | primary |
| Tier | `tier` | select | yes | Development, Staging, Production |
| Cloud region | `cloud-region` | select | no | ap-south-1, ap-south-2, Other |
| Owning team | `owning-team` | reference | no | organization_unit |
| URL | `url` | url | no | |

Samples: `dev-shared` Development; `staging-v3` Staging; `prod-in` Production `https://app.nimbuslabs.example`.

### 6. Equipment Assignments (`equipment-assignments`)

| Field | Key | Type | Req | Config |
| --- | --- | --- | --- | --- |
| Assignment code | `assignment-code` | text | yes | primary |
| Asset | `asset` | reference | yes | custom_entity → company-assets, multiple false |
| Employee | `employee` | reference | yes | person, multiple false |
| Assigned on | `assigned-on` | date | yes | |
| Returned on | `returned-on` | date | no | |
| Condition note | `condition-note` | long_text | no | |

Samples: ASN-001 → AST-2026-001 + EMP-T-011 (2024-03-15); ASN-002 → AST-2026-002 + EMP-T-004 (2023-11-05).

**Note:** Assets also have `assigned-employee` for a simple single link. The assignments entity models history; both are valid patterns—prefer one in production to avoid dual sources of truth.

---

## H. Industry-Specific Custom Field Options

Technology-focused additions used above:

- Person: Primary technology, GitHub profile, Work mode; Skills options extended with TypeScript, DevOps, Customer Success, Product.
- Org unit: Engineering discipline, On-call team.
- Assets: Operating system, Assigned employee.
- Entities: Software Environments, Equipment Assignments.

---

## I. Realistic Relationships Checklist

- Every person `department` points at an OU-TECH-* unit in this company.
- Unit managers reference people in the same company.
- Parent units form a tree without cycles.
- Asset `assigned-employee` and assignment records reference EMP-T-* people that exist.
- Project owning unit / owner reference valid units and people.
- Vendor ↔ contract link is **not** modelled here (no Contracts entity in this tenant).
- Cross-company references are rejected by APIs (404 / validation).

---

## J. Demo Scenarios

1. **Add a new engineer** — Create Person with employee-id, joining date, skills, primary technology, GitHub URL, work mode; set department to Backend Platform; membership role Employee.
2. **Invite a contractor** — Create invitation INV-TECH-02 style with reason Contractor, start date, welcome note; after accept, set membership access-level Temporary (invitation CF does not auto-copy).
3. **Create a new team** — Add org unit under Engineering with discipline Frontend, on-call false, cost centre, headcount budget.
4. **Assign a laptop** — Create asset + assignment record linking person and asset; filter assets by Status = In use.
5. **Manage a project** — Create/update PRJ-NL-01 with budget INR, owning unit, owner person; filter `filter.status=Active` if field is filterable.
6. **Tenant isolation** — Open manufacturing/retail company workspace; confirm Nimbus Labs people, assets, and projects are not listed (company_id scoping).

Unsupported / future capability tests (do not claim as working today):

- Bulk CSV import of custom entity records.
- Automatic role grant from invitation “Suggested role”.
- Person belonging to Engineering **and** Product simultaneously.
- File upload of asset invoices / photos.

---

## K. Implementation Compatibility and Gaps

| Requirement | Supported by current code? | Relevant model/API/UI | Gap or limitation |
| --- | --- | --- | --- |
| Per-company custom fields | Yes | `CustomField`, Settings UI, `/custom-fields/` | Definitions are not shared globally |
| Company / person / OU / invitation / membership CF | Yes | `FieldEntity` + `custom_data` JSONB | Task entity enum exists; not used in this demo |
| Field types listed in §B–G | Yes | `FieldType` + `field_types.normalize_value` | No currency, file, datetime, or rich text |
| Person reference (manager) | Yes | reference target `person` | Defaults to multiple=true; set `multiple: false` |
| Org unit hierarchy + manager | Yes | `Department.parent`, `manager` | Parent type rules optional via `allowed_parent_keys` |
| One person → one org unit | Yes (constraint) | `Person.department` FK | Multi-unit membership unsupported |
| Invitation statuses | Yes | `InvitationStatus` | Expired typically time-based; revoke/resend APIs exist |
| Invitation CF → membership copy | No | `accept_invitation` | Bags stay independent by design |
| Invite-time role assignment | No | invite POST has no `role_ids` | Roles set after join on membership |
| Custom entities + records | Yes | `CustomEntity*`, Studio/Custom Records UI | Quotas: 20 / 50 / 10 000 |
| Record ↔ person / OU / entity links | Yes | reference + `custom_entity` target | Must configure `entity_id` for entity links |
| Filter by custom field | Yes | `filterable` + `filter.<key>` | Sensitive filters need elevation |
| Currency-typed INR | No | use `number` | Display currency in UI/docs only |
| Attachments / images | No | — | Out of scope |
| DB RLS tenant isolation | Planned | docs/06 | App-level `company_id` filtering is what demos today |
| Industry-specific hardcoded modules | N/A | — | Intentionally avoided; all via custom config |

---

*Document version: aligned with Pulse dynamic data model (`docs/architecture/13-dynamic-data-model.md`) and models in `tenants` / `organization`.*
