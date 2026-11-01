# Demo Data — Retail Company

Independent demo dataset for **Lotus Lane Retail Private Limited**, a multi-store specialty retail chain with presence in Mumbai, Bengaluru, and Kochi.
Configure as a **separate** Pulse company so retail custom fields and entities do not pollute technology or manufacturing tenants.

Emails: `@lotuslane.example`. Synthetic Indian mobiles. Dates: `YYYY-MM-DD`. Money: INR via `number`.

---

## A. Company Profile

| Attribute | Value |
| --- | --- |
| Demo company ID | `CO-RET-001` |
| Display name | Lotus Lane |
| Legal name | Lotus Lane Retail Private Limited |
| Slug | `lotus-lane` |
| Industry | Retail (lifestyle & home specialty) |
| Company size | 51-200 |
| Website | `https://www.lotuslane.example` |
| Founded year | 2015 |
| About | Lotus Lane operates specialty lifestyle stores across western and southern India, with a small central merchandising team in Mumbai and flagship stores in Mumbai, Bengaluru, and Kochi. |
| Support email | `care@lotuslane.example` |
| WhatsApp business | `9876503001` |
| Country / timezone | IN / Asia/Kolkata |
| Company status | `active` |
| Business locations | Mumbai HQ; Stores in Bandra (Mumbai), Indiranagar (Bengaluru), Marine Drive (Kochi); Shared warehouse in Navi Mumbai |
| Approximate headcount | ~95 (demo shows 15 people) |

---

## B. Company Custom Fields

Entity `company` for this tenant only.

| Field name | Key | Type | Required | Options / config | Example | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| Industry | `industry` | select | yes | Technology, Manufacturing, Retail, Services, Other | Retail | Segment |
| Company size | `company-size` | select | no | 1-10, 11-50, 51-200, 201-1000, 1000+ | 51-200 | Scale |
| Website | `website` | url | no | — | `https://www.lotuslane.example` | Site |
| Founded year | `founded-year` | number | no | integer_only | 2015 | Age |
| About | `about` | long_text | no | — | (profile) | Description |
| Support email | `support-email` | email | no | — | `care@lotuslane.example` | Customer care |
| WhatsApp business | `whatsapp-business` | phone | no | indian_mobile | `9876503001` | Commerce WhatsApp |
| Store count | `store-count` | number | no | integer_only | 3 | Active stores |
| Retail format | `retail-format` | select | no | Specialty, Department, Convenience, Online-only, Other | Specialty | Format |
| GSTIN (display) | `gstin-display` | text | no | pattern digits optional — prefer billing profile for real GST | 27AAAAA0000A1Z5 | Demo-only display; billing GSTIN remains on `CompanyBillingProfile` |

Do not replace billing profile GSTIN with a custom field for real tax flows — billing uses `CompanyBillingProfile.gstin`.

---

## C. Organization Structure and Units

### Capabilities

Same platform primitives: organization units (`Department`) with parent hierarchy, unit types, manager Person, custom_data. One Person → one unit.

### Suggested unit types

| Key | Singular | Plural | Allowed parents |
| --- | --- | --- | --- |
| `division` | Division | Divisions | [] |
| `region` | Region | Regions | `division` |
| `department` | Department | Departments | `division`, `region` |
| `store` | Store | Stores | `region` |
| `team` | Team | Teams | `store`, `department` |

### Hierarchy

```
Lotus Lane (company)
├── Headquarters — Mumbai                 [division]   OU-RET-HQ
│   ├── Merchandising                     [department] OU-RET-MERCH
│   ├── Human Resources                   [department] OU-RET-HR
│   ├── Finance                           [department] OU-RET-FIN
│   └── Warehouse — Navi Mumbai           [department] OU-RET-WH
├── West Region                           [region]     OU-RET-WEST
│   └── Store — Bandra                    [store]      OU-RET-ST-BAN
│       ├── Front of House                [team]       OU-RET-BAN-FOH
│       └── Stock Room                    [team]       OU-RET-BAN-STK
└── South Region                          [region]     OU-RET-SOUTH
    ├── Store — Indiranagar               [store]      OU-RET-ST-IND
    │   └── Floor Team                    [team]       OU-RET-IND-FL
    └── Store — Kochi Marine Drive        [store]      OU-RET-ST-COK
        └── Floor Team                    [team]       OU-RET-COK-FL
```

### Organization unit custom fields

| Field name | Key | Type | Required | Options | Purpose |
| --- | --- | --- | --- | --- | --- |
| Cost center code | `cost-center-code` | text | no | — | Finance |
| Floor / location | `floor-location` | text | no | — | Mall / floor |
| Headcount budget | `headcount-budget` | number | no | integer_only | Planned HC |
| Unit type tag | `unit-type-tag` | select | no | HQ, Branch, Remote, Support | Soft tag |
| Active from | `active-from` | date | no | — | Opened |
| Store code | `store-code` | text | no | — | POS / ERP code |
| Region label | `region-label` | select | no | West, South, Central, N/A | Sales region |
| Store type | `store-type` | select | no | Flagship, Standard, Pop-up, Warehouse, Office | Format |

### Unit records

| Demo ID | Name | Type | Parent | Manager | ~HC | Cost center | Floor / location | Budget | Active from | Store CF |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OU-RET-HQ | Headquarters — Mumbai | division | — | P-RET-001 | 18 | CC-HQ | Lower Parel · L12 | 22 | 2015-05-01 | Office |
| OU-RET-MERCH | Merchandising | department | OU-RET-HQ | P-RET-004 | 5 | CC-MRCH | L12 · Cubes | 6 | 2015-06-01 | — |
| OU-RET-HR | Human Resources | department | OU-RET-HQ | P-RET-005 | 3 | CC-HR | L12 · HR | 4 | 2015-06-01 | — |
| OU-RET-FIN | Finance | department | OU-RET-HQ | P-RET-006 | 3 | CC-FIN | L12 · Fin | 4 | 2015-06-01 | — |
| OU-RET-WH | Warehouse — Navi Mumbai | department | OU-RET-HQ | P-RET-007 | 8 | CC-WH | Taloja Shed B | 10 | 2017-01-01 | Warehouse |
| OU-RET-WEST | West Region | region | — | P-RET-002 | 28 | CC-W | — | 35 | 2016-01-01 | West |
| OU-RET-ST-BAN | Store — Bandra | store | OU-RET-WEST | P-RET-008 | 14 | CC-ST-BAN | Linking Road · G+1 | 16 | 2016-04-01 | ST-BAN · Flagship · West |
| OU-RET-BAN-FOH | Front of House | team | OU-RET-ST-BAN | P-RET-010 | 9 | CC-ST-BAN | Ground floor | 10 | 2016-04-01 | — |
| OU-RET-BAN-STK | Stock Room | team | OU-RET-ST-BAN | P-RET-011 | 4 | CC-ST-BAN | Basement | 5 | 2016-04-01 | — |
| OU-RET-SOUTH | South Region | region | — | P-RET-003 | 32 | CC-S | — | 40 | 2018-08-01 | South |
| OU-RET-ST-IND | Store — Indiranagar | store | OU-RET-SOUTH | P-RET-009 | 12 | CC-ST-IND | 100 Feet Rd | 14 | 2018-09-01 | ST-IND · Standard · South |
| OU-RET-IND-FL | Floor Team | team | OU-RET-ST-IND | P-RET-012 | 10 | CC-ST-IND | L1 sales floor | 12 | 2018-09-01 | — |
| OU-RET-ST-COK | Store — Kochi Marine Drive | store | OU-RET-SOUTH | P-RET-013 | 10 | CC-ST-COK | Marine Drive | 12 | 2021-11-01 | ST-COK · Standard · South |
| OU-RET-COK-FL | Floor Team | team | OU-RET-ST-COK | P-RET-014 | 8 | CC-ST-COK | Ground | 10 | 2021-11-01 | — |

**Note:** Store identity can live as an org unit (above) **and/or** a custom entity `retail-stores` for richer store attributes (hours, seats). Prefer org units for people placement; use the entity for operational attributes that are not org hierarchy. Do not invent a second home for the same employee.

---

## D. People and Employee Custom Fields

### Person custom fields

| Field name | Key | Type | Required | Options / config |
| --- | --- | --- | --- | --- |
| Employee ID | `employee-id` | text | yes | — |
| Date of joining | `date-of-joining` | date | yes | — |
| Employment type | `employment-type` | select | yes | Full-time, Contract, Intern |
| Personal phone | `personal-phone` | phone | no | indian_mobile |
| Skills | `skills` | multi_select | no | Sales, Visual merchandising, Inventory, Customer care, HR, Finance, Logistics |
| Manager | `manager` | reference | no | person, multiple false |
| Assigned store | `assigned-store` | reference | no | organization_unit **or** custom_entity retail-stores — pick one; demo uses organization_unit, multiple false |
| Shift | `shift` | select | no | Morning, Afternoon, Split, General |
| Sales region | `sales-region` | select | no | West, South, Central, HQ |

`assigned-store` duplicates information already on `Person.department` when the person sits under a store team. Use it only for HQ staff who support a store while belonging to Merchandising, **or** skip it and rely on department alone. Demo: store associates use department only; two HQ merchandisers set `assigned-store` for store visits.

### Sample people (15)

| Emp ID | Name | Work email | Joined | Type | Phone | Skills | Unit | Manager | Job title | App role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EMP-R-001 | Rhea Kapoor | `rhea.kapoor@lotuslane.example` | 2015-05-01 | Full-time | 9876503101 | Sales, Finance | OU-RET-HQ | — | Founder & CEO | Owner |
| EMP-R-002 | Amit Shah | `amit.shah@lotuslane.example` | 2016-02-01 | Full-time | 9876503102 | Sales | OU-RET-WEST | EMP-R-001 | Regional Manager — West | Department Manager |
| EMP-R-003 | Divya Nambiar | `divya.nambiar@lotuslane.example` | 2018-08-01 | Full-time | 9876503103 | Sales | OU-RET-SOUTH | EMP-R-001 | Regional Manager — South | Department Manager |
| EMP-R-004 | Karan Malhotra | `karan.malhotra@lotuslane.example` | 2016-06-01 | Full-time | 9876503104 | Visual merchandising | OU-RET-MERCH | EMP-R-001 | Head of Merchandising | Employee |
| EMP-R-005 | Sana Iqbal | `sana.iqbal@lotuslane.example` | 2017-01-15 | Full-time | 9876503105 | HR | OU-RET-HR | EMP-R-001 | HR Manager | HR Manager |
| EMP-R-006 | Nitin Rao | `nitin.rao@lotuslane.example` | 2017-04-01 | Full-time | 9876503106 | Finance | OU-RET-FIN | EMP-R-001 | Finance Lead | Employee |
| EMP-R-007 | Meena Iyer | `meena.iyer@lotuslane.example` | 2017-02-01 | Full-time | 9876503107 | Logistics, Inventory | OU-RET-WH | EMP-R-001 | Warehouse Manager | Employee |
| EMP-R-008 | Rohit Bhandari | `rohit.bhandari@lotuslane.example` | 2016-04-15 | Full-time | 9876503108 | Sales, Customer care | OU-RET-ST-BAN | EMP-R-002 | Store Manager — Bandra | Employee |
| EMP-R-009 | Ananya Krish | `ananya.krish@lotuslane.example` | 2018-09-01 | Full-time | 9876503109 | Sales | OU-RET-ST-IND | EMP-R-003 | Store Manager — Indiranagar | Employee |
| EMP-R-010 | Priyanka Desai | `priyanka.desai@lotuslane.example` | 2019-03-01 | Full-time | 9876503110 | Sales, Visual merchandising | OU-RET-BAN-FOH | EMP-R-008 | Senior Sales Associate | Employee |
| EMP-R-011 | Imtiaz Ali | `imtiaz.ali@lotuslane.example` | 2020-07-01 | Full-time | 9876503111 | Inventory | OU-RET-BAN-STK | EMP-R-008 | Stock Associate | Employee |
| EMP-R-012 | Harini Prasad | `harini.prasad@lotuslane.example` | 2021-01-10 | Full-time | 9876503112 | Sales | OU-RET-IND-FL | EMP-R-009 | Sales Associate | Employee |
| EMP-R-013 | Jose Mathew | `jose.mathew@lotuslane.example` | 2021-11-01 | Full-time | 9876503113 | Sales, Customer care | OU-RET-ST-COK | EMP-R-003 | Store Manager — Kochi | Employee |
| EMP-R-014 | Aisha Rahman | `aisha.rahman@lotuslane.example` | 2022-05-02 | Full-time | 9876503114 | Sales | OU-RET-COK-FL | EMP-R-013 | Sales Associate | Employee |
| EMP-R-015 | Varun Sethi | `varun.sethi@lotuslane.example` | 2025-08-01 | Intern | 9876503115 | Visual merchandising | OU-RET-MERCH | EMP-R-004 | Merchandising Intern | Employee |

Person IDs `P-RET-001` … `P-RET-015` ↔ EMP-R-001 … EMP-R-015.

**Industry CF:** EMP-R-010 Morning shift, West; EMP-R-014 Afternoon, South; EMP-R-015 General, HQ; EMP-R-004 assigned-store → OU-RET-ST-BAN (merch visits).

Store managers remain **Employee** (or Department Manager only if you choose to grant leave-decision permissions). Job title “Store Manager” ≠ Administrator.

---

## E. Invitations and Invitation Custom Fields

Same invitation model: statuses `pending` | `accepted` | `revoked` | `expired`; custom_data not copied on accept; default role Employee.

| Field name | Key | Type | Options |
| --- | --- | --- | --- |
| Invite reason | `invite-reason` | select | New hire, Contractor, Partner, Other |
| Start date | `start-date` | date | — |
| Suggested role | `suggested-role` | text | Informal |
| Onboarding buddy email | `onboarding-buddy-email` | email | — |
| Welcome note | `welcome-note` | long_text | — |

### Sample invitations (demo only)

| Demo ID | Email | Status | Reason | Start | Suggested role | Buddy | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| INV-RET-01 | `new.associate@lotuslane.example` | pending | New hire | 2026-11-05 | Employee | `priyanka.desai@lotuslane.example` | Bandra FOH hire |
| INV-RET-02 | `vm.freelancer@partner.example` | pending | Contractor | 2026-10-22 | Employee | `karan.malhotra@lotuslane.example` | Festival visual merch contractor |
| INV-RET-03 | `mall.ops@partner.example` | pending | Partner | 2026-12-01 | Employee | `amit.shah@lotuslane.example` | Mall operations liaison |
| INV-RET-04 | `ex.offer@lotuslane.example` | revoked | New hire | 2026-09-01 | Employee | `sana.iqbal@lotuslane.example` | Candidate withdrew |
| INV-RET-05 | `seasonal.kochi@lotuslane.example` | expired | Contractor | 2025-12-15 | Employee | `jose.mathew@lotuslane.example` | Seasonal hire window closed |

---

## F. Memberships and Membership Custom Fields

| Field name | Key | Type | Options |
| --- | --- | --- | --- |
| Access level note | `access-level-note` | select | Standard, Elevated, Temporary |
| Probation end date | `probation-end-date` | date | — |
| Desk / seat | `desk-seat` | text | — |
| Preferred language | `preferred-language` | select | English, Hindi, Malayalam, Other |
| Internal notes | `internal-notes` | long_text | sensitive OK |

### Examples

| Person | App role | Access note | Probation | Desk / seat | Language | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| EMP-R-001 | Owner | Elevated | — | HQ-CEO | English | — |
| EMP-R-002 | Department Manager | Elevated | — | REG-W | Hindi | Regional |
| EMP-R-005 | HR Manager | Elevated | — | HQ-HR-1 | English | — |
| EMP-R-010 | Employee | Standard | — | BAN-FOH-04 | Hindi | — |
| EMP-R-002 style contractor after INV-RET-02 accept | Employee | Temporary | — | Remote VM | English | Festival only |
| EMP-R-015 | Employee | Standard | 2026-01-31 | HQ-MRCH-03 | English | Intern probation |

---

## G. Custom Entities and Sample Records

| Entity | Key | Purpose |
| --- | --- | --- |
| Retail Stores | `retail-stores` | Operational store master (hours, capacity) |
| Product Categories | `product-categories` | Merchandising taxonomy |
| Store Equipment | `store-equipment` | POS / fixtures (assets at store) |
| Vendors | `vendors` | Brand / fixture suppliers |
| Projects | `projects` | Store opening / remodel projects |
| Contracts | `contracts` | Lease / brand MSAs |
| Company Assets | `company-assets` | HQ devices |

Office Locations can be skipped if `retail-stores` covers sites; warehouse can remain an org unit only.

### 1. Retail Stores (`retail-stores`)

| Field | Key | Type | Req | Options / config |
| --- | --- | --- | --- | --- |
| Store code | `store-code` | text | yes | primary |
| Display name | `display-name` | text | yes | |
| City | `city` | text | yes | |
| Address | `address` | long_text | no | |
| Opening hours | `opening-hours` | text | no | e.g. 10:00–21:00 |
| Store manager | `store-manager` | reference | no | person, multiple false |
| Org unit | `org-unit` | reference | no | organization_unit → store unit |
| Seating / capacity | `capacity` | number | no | footfall planning seats/capacity |
| Opened on | `opened-on` | date | no | |

Samples:

| Code | Name | City | Hours | Manager | Org unit | Capacity | Opened |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ST-BAN | Bandra Flagship | Mumbai | 10:00–22:00 | EMP-R-008 | OU-RET-ST-BAN | 120 | 2016-04-01 |
| ST-IND | Indiranagar | Bengaluru | 10:30–21:30 | EMP-R-009 | OU-RET-ST-IND | 90 | 2018-09-01 |
| ST-COK | Kochi Marine Drive | Kochi | 10:00–21:00 | EMP-R-013 | OU-RET-ST-COK | 70 | 2021-11-01 |

### 2. Product Categories (`product-categories`)

| Field | Key | Type | Req | Options |
| --- | --- | --- | --- | --- |
| Category code | `category-code` | text | yes | primary |
| Name | `name` | text | yes | |
| Status | `status` | select | yes | Active, Seasonal, Retired |
| Merch owner | `merch-owner` | reference | no | person |

Samples: CAT-HOME Home décor Active EMP-R-004; CAT-GIFT Gifting Seasonal; CAT-TXT Textiles Active.

### 3. Store Equipment (`store-equipment`)

| Field | Key | Type | Req | Options / config |
| --- | --- | --- | --- | --- |
| Equipment tag | `equipment-tag` | text | yes | primary |
| Category | `category` | select | yes | POS, Display fixture, Security, Other |
| Status | `status` | select | yes | In use, In storage, Retired |
| Store | `store` | reference | no | custom_entity → retail-stores |
| Purchase date | `purchase-date` | date | no | |

Samples: SEQ-POS-BAN-01 POS In use ST-BAN; SEQ-DISP-IND-03 Display fixture In use ST-IND; SEQ-CCTV-COK-02 Security In use ST-COK.

### 4. Vendors (`vendors`)

Baseline + retail categories: IT, Facilities, Marketing, **Brand**, **Logistics**, Other.

Samples: Coastal Crafts Co (Brand); SwiftMove Logistics (Logistics); MallTech POS (IT).

### 5. Projects (`projects`)

Baseline + owning unit + owner references.

| Code | Title | Status | Start | Budget INR | Unit | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| PRJ-LL-01 | Kochi store launch | Done | 2021-06-01 | 6500000 | OU-RET-ST-COK | EMP-R-003 |
| PRJ-LL-02 | Bandra remodel | Active | 2026-07-01 | 4200000 | OU-RET-ST-BAN | EMP-R-002 |
| PRJ-LL-03 | Diwali VM kit 2026 | Planned | 2026-10-01 | 850000 | OU-RET-MERCH | EMP-R-004 |

### 6. Contracts (`contracts`)

Baseline fields + optional `linked-vendor` reference.

Samples: CTR-R-200 Bandra mall Lease 18000000 expiry 2028-03-31; CTR-R-201 Coastal Crafts MSA 5000000; CTR-R-202 SwiftMove SOW 1200000.

### 7. Company Assets (`company-assets`)

Baseline laptop/phone/monitor for HQ staff.

Samples: AST-R-001 Laptop EMP-R-004; AST-R-002 Phone EMP-R-001; AST-R-003 Monitor In storage.

---

## H. Industry-Specific Custom Field Options

- Person: Assigned store (optional), Shift, Sales region; retail Skills list.
- Org unit: Store code, Region label, Store type.
- Retail Stores entity: Opening hours, Store manager, Capacity.
- Store Equipment linked to Retail Stores records.

---

## I. Realistic Relationships Checklist

- Floor associates’ `department` is the store team (FOH / Floor), not HQ.
- Store managers are unit managers on store units and managers of floor staff.
- Retail Stores entity `org-unit` points at the matching store organization unit.
- Equipment references store entity records.
- Projects reference store or merch units and person owners.
- Vendors/contracts link only when reference fields are configured.
- Malayalam preferred language on Kochi memberships is valid select option.

---

## J. Demo Scenarios

1. **Add a store associate** — Person with shift Afternoon, sales-region South, department Kochi Floor Team, skills Sales; role Employee.
2. **Invite a VM contractor** — Invitation Contractor + welcome note; after accept set membership Temporary.
3. **Open a new store unit** — Create region child store unit with store-code, store-type Pop-up, then optional Retail Stores entity row with hours and manager.
4. **Assign store equipment** — Create Store Equipment linked to ST-BAN; filter by category POS.
5. **Track remodel project** — Update PRJ-LL-02 status/budget; link owning unit Bandra store.
6. **Tenant isolation** — Lotus Lane store records must not appear in Nimbus Labs or Aether Precision workspaces.

Unsupported / future:

- POS transaction sync or inventory quantities as first-class modules.
- Geo-fencing / clock-in by store.
- Person assigned to two stores at once.
- Map embed or image gallery field types.

---

## K. Implementation Compatibility and Gaps

| Requirement | Supported? | Model/API/UI | Gap |
| --- | --- | --- | --- |
| Store as org unit | Yes | `Department` + custom unit type `store` | Not a dedicated Store model |
| Store as custom entity | Yes | `CustomEntity` retail-stores | Dual modelling possible; document single source of truth |
| Opening hours as text | Yes | text CF | No structured time-range type |
| Person → one store team | Yes | `Person.department` | Multi-store roster unsupported |
| Reference store from equipment | Yes | reference → custom_entity | Requires entity_id in field config |
| Lease contracts INR | Partial | number | No currency / GST line items on entity |
| Invitation states | Yes | InvitationStatus + revoke/resend | Expired usually via `expires_at` |
| Suggested role → CompanyRole | No | text CF only | Roles assigned on membership after join |
| Filter associates by shift | Yes | filterable person CF | Enable `filterable` on Shift |
| Billing GSTIN vs CF | Built-in vs CF | `CompanyBillingProfile` | Prefer billing profile for tax |
| Cross-tenant isolation | Yes (app) | company_id on all rows | RLS still planned |

---

*Use this document alone to configure the retail tenant. Do not merge field option lists with the technology or manufacturing companies.*
