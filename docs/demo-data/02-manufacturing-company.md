# Demo Data — Manufacturing Company

Independent demo dataset for **Aether Precision Components Private Limited**, a Pune / Chennai industrial manufacturer.
Configure a separate Pulse company workspace; do not mix these field definitions with the technology or retail tenants.

Emails use `@aetherprecision.example`. Phones are synthetic Indian mobiles. Dates are `YYYY-MM-DD`. Monetary values are INR in `number` fields.

---

## A. Company Profile

| Attribute | Value |
| --- | --- |
| Demo company ID | `CO-MFG-001` |
| Display name | Aether Precision |
| Legal name | Aether Precision Components Private Limited |
| Slug | `aether-precision` |
| Industry | Manufacturing (automotive & industrial CNC components) |
| Company size | 201-1000 |
| Website | `https://www.aetherprecision.example` |
| Founded year | 2009 |
| About | Aether Precision machines metal components for automotive OEMs and industrial equipment makers. Primary plant is in Pune (Chakan); a secondary finishing plant operates in Chennai (Sriperumbudur). |
| Support email | `support@aetherprecision.example` |
| WhatsApp business | `9876502001` |
| Country / timezone | IN / Asia/Kolkata |
| Company status | `active` |
| Business locations | Pune Plant (Chakan); Chennai Finishing Plant; Pune Corporate Office |
| Approximate headcount | ~220 plant + office staff (demo shows 18 people) |

---

## B. Company Custom Fields

Entity `company` — tenant-local definitions only.

| Field name | Key | Type | Required | Options / config | Example | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| Industry | `industry` | select | yes | Technology, Manufacturing, Retail, Services, Other | Manufacturing | Segment |
| Company size | `company-size` | select | no | 1-10, 11-50, 51-200, 201-1000, 1000+ | 201-1000 | Scale |
| Website | `website` | url | no | — | `https://www.aetherprecision.example` | Public site |
| Founded year | `founded-year` | number | no | integer_only | 2009 | Age |
| About | `about` | long_text | no | — | (profile) | Description |
| Support email | `support-email` | email | no | — | `support@aetherprecision.example` | Contact |
| WhatsApp business | `whatsapp-business` | phone | no | indian_mobile | `9876502001` | WhatsApp |
| Plant count | `plant-count` | number | no | integer_only, min 1 | 2 | Multi-site scale |
| Primary end market | `primary-end-market` | select | no | Automotive, Industrial, Aerospace, Other | Automotive | Customer segment |
| ISO certification | `iso-certification` | multi_select | no | ISO 9001, IATF 16949, ISO 14001, None | ISO 9001, IATF 16949 | Quality posture |

---

## C. Organization Structure and Units

### Capabilities (same platform as other tenants)

- `Department` = organization unit with `parent`, `unit_type`, `manager` (Person), `status`, `custom_data`.
- Default types: `division`, `department`, `team`. This tenant can add manufacturing-oriented types.
- Person → **one** unit via `Person.department`.

### Suggested unit types for this tenant

| Key | Singular | Plural | Allowed parents |
| --- | --- | --- | --- |
| `division` | Division | Divisions | [] |
| `plant` | Plant | Plants | `division` |
| `department` | Department | Departments | `plant`, `division` |
| `team` | Team | Teams | `department` |
| `line` | Production line group | Production line groups | `department` |

(`plant` and `line` are optional custom types — fully supported via `OrganizationUnitType`.)

### Hierarchy

```
Aether Precision (company)
├── Corporate — Pune Office              [division]  OU-MFG-CORP
│   ├── Human Resources                  [department] OU-MFG-HR
│   ├── Finance                          [department] OU-MFG-FIN
│   └── Quality Assurance (corporate)    [department] OU-MFG-QA-C
├── Pune Plant — Chakan                  [plant]     OU-MFG-PUN
│   ├── Production                       [department] OU-MFG-PROD-P
│   │   ├── CNC Cell A                   [line]      OU-MFG-CNC-A
│   │   └── CNC Cell B                   [line]      OU-MFG-CNC-B
│   ├── Maintenance                      [department] OU-MFG-MNT-P
│   └── Stores & Logistics               [department] OU-MFG-STO-P
└── Chennai Plant — Sriperumbudur        [plant]     OU-MFG-CHN
    ├── Finishing Operations             [department] OU-MFG-FINSH
    └── Plant Quality                    [department] OU-MFG-QA-CHN
```

### Organization unit custom fields

| Field name | Key | Type | Required | Options | Purpose |
| --- | --- | --- | --- | --- | --- |
| Cost center code | `cost-center-code` | text | no | — | Finance |
| Floor / location | `floor-location` | text | no | — | Bay / shed label |
| Headcount budget | `headcount-budget` | number | no | integer_only | Planned headcount |
| Unit type tag | `unit-type-tag` | select | no | HQ, Branch, Remote, Support | Soft tag |
| Active from | `active-from` | date | no | — | Go-live |
| Production area | `production-area` | select | no | Machining, Finishing, Assembly, Stores, Office, N/A | Shop-floor area |
| Shift type | `shift-type` | select | no | General, A/B/C rotating, Night only, N/A | Default shift pattern |

### Unit records

| Demo ID | Name | Type | Parent | Manager | ~HC | Cost center | Location | Budget | Active from | Area / shift |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OU-MFG-CORP | Corporate — Pune Office | division | — | P-MFG-001 | 25 | CC-CORP | Baner · Floor 2 | 30 | 2009-04-01 | Office / General |
| OU-MFG-HR | Human Resources | department | OU-MFG-CORP | P-MFG-007 | 4 | CC-HR | Baner · 2B | 5 | 2009-04-01 | Office |
| OU-MFG-FIN | Finance | department | OU-MFG-CORP | P-MFG-008 | 5 | CC-FIN | Baner · 2C | 6 | 2009-04-01 | Office |
| OU-MFG-QA-C | Quality Assurance (corporate) | department | OU-MFG-CORP | P-MFG-006 | 6 | CC-QA | Baner · 2D | 8 | 2012-01-01 | Office |
| OU-MFG-PUN | Pune Plant — Chakan | plant | — | P-MFG-002 | 140 | CC-PUN | Chakan Shed 1–3 | 160 | 2010-08-01 | Machining / A/B/C |
| OU-MFG-PROD-P | Production | department | OU-MFG-PUN | P-MFG-003 | 90 | CC-PUN-PR | Shed 1 | 100 | 2010-08-01 | Machining / rotating |
| OU-MFG-CNC-A | CNC Cell A | line | OU-MFG-PROD-P | P-MFG-011 | 28 | CC-PUN-A | Shed 1 · Bay A | 32 | 2014-05-01 | Machining / rotating |
| OU-MFG-CNC-B | CNC Cell B | line | OU-MFG-PROD-P | P-MFG-012 | 26 | CC-PUN-B | Shed 1 · Bay B | 30 | 2016-09-01 | Machining / rotating |
| OU-MFG-MNT-P | Maintenance | department | OU-MFG-PUN | P-MFG-013 | 12 | CC-PUN-MT | Shed 2 | 14 | 2010-08-01 | Machining / General |
| OU-MFG-STO-P | Stores & Logistics | department | OU-MFG-PUN | P-MFG-014 | 10 | CC-PUN-ST | Shed 3 | 12 | 2010-08-01 | Stores / General |
| OU-MFG-CHN | Chennai Plant — Sriperumbudur | plant | — | P-MFG-009 | 55 | CC-CHN | SIPCOT Plot 12 | 70 | 2018-03-01 | Finishing / A/B/C |
| OU-MFG-FINSH | Finishing Operations | department | OU-MFG-CHN | P-MFG-015 | 35 | CC-CHN-F | Plot 12 · Hall 1 | 40 | 2018-03-01 | Finishing / rotating |
| OU-MFG-QA-CHN | Plant Quality | department | OU-MFG-CHN | P-MFG-016 | 8 | CC-CHN-Q | Plot 12 · Lab | 10 | 2018-03-01 | Finishing / General |

---

## D. People and Employee Custom Fields

### Person custom fields

| Field name | Key | Type | Required | Options / config |
| --- | --- | --- | --- | --- |
| Employee ID | `employee-id` | text | yes | — |
| Date of joining | `date-of-joining` | date | yes | — |
| Employment type | `employment-type` | select | yes | Full-time, Contract, Intern |
| Personal phone | `personal-phone` | phone | no | indian_mobile |
| Skills | `skills` | multi_select | no | CNC, Quality, Maintenance, Welding, Logistics, HR, Finance, Sales, Safety |
| Manager | `manager` | reference | no | person, multiple false |
| Shift | `shift` | select | no | General, Shift A, Shift B, Shift C |
| Safety certification | `safety-certification` | multi_select | no | Basic EHS, Forklift, Confined space, Electrical L1, None |
| Machine qualification | `machine-qualification` | multi_select | no | VMC, HMC, Lathe, Grinder, CMM, None |

Baseline skills from the shared guidance are replaced here with manufacturing-relevant options for this tenant only (per-company option lists).

### Sample people (18)

| Emp ID | Name | Work email | Joined | Type | Phone | Skills | Unit | Manager | Job title | App role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EMP-M-001 | Suresh Patil | `suresh.patil@aetherprecision.example` | 2009-04-01 | Full-time | 9876502101 | Sales, Finance | OU-MFG-CORP | — | Managing Director | Owner |
| EMP-M-002 | Anita Kulkarni | `anita.kulkarni@aetherprecision.example` | 2010-08-01 | Full-time | 9876502102 | CNC, Safety | OU-MFG-PUN | EMP-M-001 | Plant Head — Pune | Department Manager |
| EMP-M-003 | Ramesh Jadhav | `ramesh.jadhav@aetherprecision.example` | 2011-02-15 | Full-time | 9876502103 | CNC | OU-MFG-PROD-P | EMP-M-002 | Production Manager | Department Manager |
| EMP-M-004 | Deepa Sharma | `deepa.sharma@aetherprecision.example` | 2012-06-01 | Full-time | 9876502104 | Quality | OU-MFG-QA-C | EMP-M-001 | Corporate QA Head | Employee |
| EMP-M-005 | Imran Qureshi | `imran.qureshi@aetherprecision.example` | 2013-09-01 | Full-time | 9876502105 | Sales | OU-MFG-CORP | EMP-M-001 | Sales Manager | Employee |
| EMP-M-006 | Kavitha Srinivasan | `kavitha.srinivasan@aetherprecision.example` | 2014-01-10 | Full-time | 9876502106 | Quality | OU-MFG-QA-C | EMP-M-004 | QA Lead | Employee |
| EMP-M-007 | Neha Joshi | `neha.joshi@aetherprecision.example` | 2015-03-01 | Full-time | 9876502107 | HR | OU-MFG-HR | EMP-M-001 | HR Manager | HR Manager |
| EMP-M-008 | Prakash Deshmukh | `prakash.deshmukh@aetherprecision.example` | 2015-07-01 | Full-time | 9876502108 | Finance | OU-MFG-FIN | EMP-M-001 | Finance Manager | Employee |
| EMP-M-009 | Murugan Selvam | `murugan.selvam@aetherprecision.example` | 2018-03-01 | Full-time | 9876502109 | Quality, Safety | OU-MFG-CHN | EMP-M-001 | Plant Head — Chennai | Department Manager |
| EMP-M-010 | Lakshmi Narayanan | `lakshmi.narayanan@aetherprecision.example` | 2018-04-15 | Full-time | 9876502110 | HR | OU-MFG-HR | EMP-M-007 | HR Executive | Employee |
| EMP-M-011 | Ganesh Pawar | `ganesh.pawar@aetherprecision.example` | 2016-05-01 | Full-time | 9876502111 | CNC | OU-MFG-CNC-A | EMP-M-003 | Cell Lead — A | Employee |
| EMP-M-012 | Sunita More | `sunita.more@aetherprecision.example` | 2017-08-01 | Full-time | 9876502112 | CNC | OU-MFG-CNC-B | EMP-M-003 | Cell Lead — B | Employee |
| EMP-M-013 | Ajay Chavan | `ajay.chavan@aetherprecision.example` | 2016-11-01 | Full-time | 9876502113 | Maintenance | OU-MFG-MNT-P | EMP-M-002 | Maintenance Supervisor | Employee |
| EMP-M-014 | Farhan Shaikh | `farhan.shaikh@aetherprecision.example` | 2019-02-01 | Full-time | 9876502114 | Logistics | OU-MFG-STO-P | EMP-M-002 | Stores In-charge | Employee |
| EMP-M-015 | Priya Rajendran | `priya.rajendran@aetherprecision.example` | 2019-06-01 | Full-time | 9876502115 | Quality | OU-MFG-FINSH | EMP-M-009 | Finishing Supervisor | Employee |
| EMP-M-016 | Karthik Subramanian | `karthik.subramanian@aetherprecision.example` | 2020-01-15 | Full-time | 9876502116 | Quality | OU-MFG-QA-CHN | EMP-M-009 | Plant Quality Lead | Employee |
| EMP-M-017 | Vikas Mane | `vikas.mane@aetherprecision.example` | 2021-09-01 | Full-time | 9876502117 | CNC, Safety | OU-MFG-CNC-A | EMP-M-011 | CNC Operator | Employee |
| EMP-M-018 | Arun Kumar | `arun.kumar@aetherprecision.example` | 2024-02-01 | Contract | 9876502118 | Maintenance | OU-MFG-MNT-P | EMP-M-013 | Maintenance Contractor | Employee |

Person IDs `P-MFG-001` … `P-MFG-018` map to EMP-M-001 … EMP-M-018.

**Industry CF samples:** EMP-M-017 Shift B, safety Basic EHS + Forklift, machine VMC + Lathe; EMP-M-013 Shift General, Electrical L1; EMP-M-018 Temporary contractor, Shift A, Basic EHS.

Job titles ≠ application roles. Plant heads use Department Manager permission template, not Owner.

---

## E. Invitations and Invitation Custom Fields

Statuses: `pending`, `accepted`, `revoked`, `expired`. Custom data does not copy on accept. Default app role on accept is Employee.

| Field name | Key | Type | Options |
| --- | --- | --- | --- |
| Invite reason | `invite-reason` | select | New hire, Contractor, Partner, Other |
| Start date | `start-date` | date | — |
| Suggested role | `suggested-role` | text | Informal only |
| Onboarding buddy email | `onboarding-buddy-email` | email | — |
| Welcome note | `welcome-note` | long_text | — |

### Sample invitations (demo only)

| Demo ID | Email | Status | Reason | Start | Suggested role | Buddy | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| INV-MFG-01 | `newhire.cnc@aetherprecision.example` | pending | New hire | 2026-11-10 | Employee | `ganesh.pawar@aetherprecision.example` | CNC Operator — Cell A |
| INV-MFG-02 | `temp.welder@contractor.example` | pending | Contractor | 2026-10-28 | Employee | `ajay.chavan@aetherprecision.example` | 6-month maintenance support |
| INV-MFG-03 | `auditor.iatf@partner.example` | pending | Partner | 2026-12-01 | Employee | `deepa.sharma@aetherprecision.example` | External IATF auditor access |
| INV-MFG-04 | `old.storekeeper@aetherprecision.example` | revoked | Other | 2026-08-01 | Employee | `neha.joshi@aetherprecision.example` | Offer withdrawn |
| INV-MFG-05 | `trainee.qa@aetherprecision.example` | expired | New hire | 2025-11-01 | Employee | `kavitha.srinivasan@aetherprecision.example` | Internship window lapsed |

---

## F. Memberships and Membership Custom Fields

| Field name | Key | Type | Options |
| --- | --- | --- | --- |
| Access level note | `access-level-note` | select | Standard, Elevated, Temporary |
| Probation end date | `probation-end-date` | date | — |
| Desk / seat | `desk-seat` | text | — |
| Preferred language | `preferred-language` | select | English, Hindi, Malayalam, Other |
| Internal notes | `internal-notes` | long_text | mark sensitive |

### Examples

| Person | App role | Access note | Probation | Desk / seat | Language | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| EMP-M-001 | Owner | Elevated | — | CORP-MD | English | — |
| EMP-M-002 | Department Manager | Elevated | — | PUN-PH-01 | Marathi→Other | Plant head |
| EMP-M-007 | HR Manager | Elevated | — | CORP-HR-02 | Hindi | — |
| EMP-M-017 | Employee | Standard | — | CNC-A-17 | Hindi | Shop floor |
| EMP-M-018 | Employee | Temporary | — | MNT-C-03 | English | Contractor |
| EMP-M-010 | Employee | Standard | 2026-06-30 | CORP-HR-05 | English | Still documenting probation historically |

---

## G. Custom Entities and Sample Records

| Entity | Key | Why |
| --- | --- | --- |
| Company Assets | `company-assets` | Tools / devices (office + plant tablets) |
| Vendors | `vendors` | Material and tool suppliers |
| Contracts | `contracts` | Supplier MSAs / leases |
| Office Locations | `office-locations` | Plants and offices as locations |
| Production Lines | `production-lines` | Line masters linked to org units |
| Machines and Equipment | `machines-and-equipment` | CNC assets on the shop floor |
| Quality Inspections | `quality-inspections` | Sample QC events |
| Supplier Deliveries | `supplier-deliveries` | Inbound lots |

Projects entity is optional here; production work is better modelled via lines and inspections for this industry demo.

### 1. Company Assets (`company-assets`)

Baseline fields + manufacturing extras:

| Field | Key | Type | Req | Options |
| --- | --- | --- | --- | --- |
| Asset tag | `asset-tag` | text | yes | primary |
| Category | `category` | select | yes | Laptop, Phone, Monitor, Other |
| Serial number | `serial-number` | text | no | |
| Status | `status` | select | yes | In use, In storage, Retired |
| Purchase date | `purchase-date` | date | no | |
| Assigned employee | `assigned-employee` | reference | no | person |

Samples: AST-M-001 Laptop → EMP-M-002; AST-M-002 Phone → EMP-M-001; AST-M-003 Monitor In storage.

### 2. Vendors (`vendors`)

Baseline fields; extend category options for this tenant: IT, Facilities, Marketing, **Raw material**, **Tooling**, Other.

Samples: Deccan Steels (Raw material, end 2027-06-30); ToolCraft India (Tooling); SecureGuard Facilities (Facilities).

### 3. Contracts (`contracts`)

| Field | Key | Type | Req | Options |
| --- | --- | --- | --- | --- |
| Contract ID | `contract-id` | text | yes | primary |
| Counterparty | `counterparty` | text | yes | |
| Type | `type` | select | yes | NDA, MSA, SOW, Lease |
| Expiry date | `expiry-date` | date | no | |
| Value | `value` | number | no | INR |
| Linked vendor | `linked-vendor` | reference | no | custom_entity → vendors |

Samples: CTR-M-100 Deccan Steels MSA, expiry 2027-06-30, value 45000000; CTR-M-101 Chakan shed Lease 12000000; CTR-M-102 ToolCraft SOW 2500000.

### 4. Office Locations (`office-locations`)

Baseline: location-code, city, address, seats, opened-on.

Samples: `LOC-PUN-OFF` Pune Baner; `LOC-PUN-PLT` Pune Chakan; `LOC-CHN-PLT` Chennai Sriperumbudur.

### 5. Production Lines (`production-lines`)

| Field | Key | Type | Req | Config |
| --- | --- | --- | --- | --- |
| Line code | `line-code` | text | yes | primary |
| Title | `title` | text | yes | |
| Status | `status` | select | yes | Active, Downtime, Decommissioned |
| Org unit | `org-unit` | reference | yes | organization_unit |
| Target OEE % | `target-oee` | number | no | 0–100 |
| Active from | `active-from` | date | no | |

Samples: LINE-A CNC Cell A → OU-MFG-CNC-A, OEE 82; LINE-B CNC Cell B → OU-MFG-CNC-B, OEE 80; LINE-F Finishing Hall → OU-MFG-FINSH, OEE 75.

### 6. Machines and Equipment (`machines-and-equipment`)

| Field | Key | Type | Req | Options |
| --- | --- | --- | --- | --- |
| Machine code | `machine-code` | text | yes | primary |
| Name | `name` | text | yes | |
| Category | `category` | select | yes | VMC, HMC, Lathe, Grinder, CMM, Other |
| Maintenance status | `maintenance-status` | select | yes | OK, Due, Overdue, Under repair |
| Last inspection date | `last-inspection-date` | date | no | |
| Production line | `production-line` | reference | no | custom_entity → production-lines |
| Responsible technician | `responsible-technician` | reference | no | person |

Samples: MCH-VMC-01 OK, 2026-09-15, LINE-A, EMP-M-013; MCH-LAT-04 Due, 2026-08-01, LINE-B; MCH-CMM-01 OK, QA lab, EMP-M-016.

### 7. Quality Inspections (`quality-inspections`)

| Field | Key | Type | Req | Options |
| --- | --- | --- | --- | --- |
| Inspection ID | `inspection-id` | text | yes | primary |
| Lot / batch | `lot-batch` | text | yes | |
| Result | `result` | select | yes | Pass, Fail, Conditional |
| Inspected on | `inspected-on` | date | yes | |
| Inspector | `inspector` | reference | no | person |
| Machine | `machine` | reference | no | custom_entity → machines-and-equipment |
| Notes | `notes` | long_text | no | |

Samples: QI-2026-001 Pass EMP-M-006 MCH-VMC-01; QI-2026-002 Fail EMP-M-016 MCH-LAT-04; QI-2026-003 Conditional EMP-M-006.

### 8. Supplier Deliveries (`supplier-deliveries`)

| Field | Key | Type | Req | Config |
| --- | --- | --- | --- | --- |
| Delivery ID | `delivery-id` | text | yes | primary |
| Vendor | `vendor` | reference | yes | custom_entity → vendors |
| Material | `material` | text | yes | |
| Quantity kg | `quantity-kg` | number | yes | |
| Delivered on | `delivered-on` | date | yes | |
| Receiving plant | `receiving-plant` | reference | no | organization_unit |
| QC status | `qc-status` | select | yes | Pending, Accepted, Rejected |

Samples: DLV-9001 Deccan Steels, EN8 bar, 12000 kg, 2026-10-01, OU-MFG-PUN, Accepted.

---

## H. Industry-Specific Custom Field Options

- Person: Shift, Safety certification, Machine qualification; manufacturing Skills list.
- Org unit: Production area, Shift type.
- Machines: Maintenance status, Last inspection date.
- Entities: Production Lines, Machines, Quality Inspections, Supplier Deliveries.

---

## I. Realistic Relationships Checklist

- Operators belong to CNC Cell A/B units, not both.
- Cell leads are unit managers and Person.manager for operators.
- Machines reference production-line records; lines reference org units.
- Inspections reference inspectors (people) and machines.
- Deliveries reference vendors and plant org units.
- Contracts may reference vendors via custom_entity reference.
- No cross-tenant links to Nimbus Labs or retail company.

---

## J. Demo Scenarios

1. **Hire a CNC operator** — Person with shift, safety certs, machine qualifications; department CNC Cell A; role Employee.
2. **Invite a maintenance contractor** — Invitation reason Contractor; after accept set membership Temporary.
3. **Add a production line group** — New org unit type `line` under Production with production-area Machining.
4. **Log machine maintenance** — Update machine maintenance-status to Due; filter machines by status.
5. **Record a failed inspection** — Create QI record Fail linked to machine and inspector.
6. **Tenant isolation** — Confirm Aether vendors/machines invisible from other company workspaces.

Future / unsupported:

- Real-time PLC / IoT machine telemetry.
- Automatic OEE calculation from events.
- Attaching inspection photo files.
- Multi-plant person assignment without changing `department`.

---

## K. Implementation Compatibility and Gaps

| Requirement | Supported? | Model/API/UI | Gap |
| --- | --- | --- | --- |
| Custom unit types (plant, line) | Yes | `OrganizationUnitType` | Defaults are division/department/team only until customized |
| Parent-child org hierarchy | Yes | `Department.parent` | Cycles blocked; optional `allowed_parent_keys` |
| Person single unit | Yes | `Person.department` | Cannot assign one operator to two cells |
| Shift / certification as CF | Yes | Person custom fields select/multi_select | No built-in attendance module for shifts |
| Machine entity + references | Yes | Custom entities + reference | No native CMMS |
| Vendor ↔ contract link | Yes | reference → custom_entity | Must create vendors entity first |
| INR contract value | Partial | `number` | No currency type or tax breakdown |
| Invitation CF persistence | Yes on invitation | `MembershipInvitation.custom_data` | Not copied to membership/person |
| Filter inspections by result | Yes | filterable flag | Must enable `filterable` on field |
| Industry hardcoding | No (by design) | — | All via tenant config |
| RLS | Planned | docs/06 | Demo relies on app-level company scoping |

---

*Aligned with Pulse `FieldType`, `CustomEntity`, and `organization` hierarchy behaviour.*
