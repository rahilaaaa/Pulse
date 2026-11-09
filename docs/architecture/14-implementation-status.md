# 14 — Implementation Status

Status: living reconciliation of documentation versus the repository. Last reconciled in Phase 0 (documentation-only). Phase 1 **design freeze** documents (not implemented): [15-shared-domain-model.md](15-shared-domain-model.md), [16-module-platform-contract.md](16-module-platform-contract.md), [17-authorization-and-tenant-integrity.md](17-authorization-and-tenant-integrity.md), [18-module-boundaries-and-roadmap.md](18-module-boundaries-and-roadmap.md). This file does not authorize schema or feature work and must **not** mark those designs as Implemented.

When this document and another architecture file disagree about **what exists in code**, this file wins until the other file is updated. When they disagree about an **approved decision**, [12-architecture-decisions.md](12-architecture-decisions.md) wins. When they disagree about **intended columns in the target DBML**, treat [schema.dbml](schema.dbml) as a design proposal that may still need review—see §2.

## 1. Status labels

| Label | Meaning |
| --- | --- |
| **Implemented** | Present in Django/React and exercised by routes or tests (or clearly used in production paths). |
| **Partial** | Important pieces exist; stated product behavior is incomplete or diverges from docs. |
| **Planned** | Approved architectural direction and/or design docs; not built (or not enabled) yet. |
| **Missing** | Expected by older docs or catalog stubs; no working implementation found. |
| **Unverified** | Not confirmed in this reconciliation pass. |

## 2. Schema sources of truth

| Source | Role |
| --- | --- |
| Django models and migrations under `backend/apps/` | **Currently implemented and verified** schema. |
| ADR-019, ADR-020, ADR-021 | **Approved architectural direction**. Conceptual detail in Phase 1 docs 15–18; field-level implementation still requires review. |
| Phase 1 docs 15–18 | **Proposed design freeze** (relationships, contracts, roadmap). Not code. |
| [schema.dbml](schema.dbml) and [03-database-design.md](03-database-design.md) | **Intended target-design proposals**. Preserve composite-key intent. Not every table or field is approved for immediate implementation. Do not treat DBML as a live dump of the database. |

Known drift examples (non-exhaustive): DBML describes composite `(company_id, parent_id)` FKs and `people.manager_person_id`; Django currently uses simple FKs and has no manager column. Leave columns differ (`days_per_year` / `starts_on` in code vs `annual_allowance_days` / `start_date` in DBML).

## 3. Platform capability matrix

| Area | Status | Evidence (repository) | Notes |
| --- | --- | --- | --- |
| Session authentication (cookies, CSRF, Argon2) | Implemented | `apps/identity/`, `config/settings/base.py` | MFA fields removed (`identity/migrations/0005_remove_mfa_fields.py`). |
| Email verification / password reset | Implemented | `identity` tokens + views | — |
| Company create / onboarding checklist | Implemented | `tenants` onboarding + frontend onboarding | One company per `created_by` enforced. |
| Billing profile + Growth trial plan select | Partial | `billing/services.py`, plan APIs | Trial/local plan selection works. Razorpay checkout, invoices, tax rates, refunds: Missing. No `billing_razorpay` app. |
| People / departments / org unit types | Implemented | `organization/` | Branches are not a first-class model. Phase 1 freeze: reuse org units for v1 ([15](15-shared-domain-model.md)). |
| Memberships / invitations | Implemented | `tenants/invitations.py`, company views | `MembershipStatus.INVITED` little used; invite rows drive flow. |
| Company roles / permission codes | Implemented | `authorization/` | Owner floor and last-owner rules tested. |
| Platform permission grants | Partial | `authorization/services.py`, `platform_admin/` | Users/companies/audit usable; billing/modules platform screens largely stubs. |
| Module catalog + HRMS install | Partial | `modules_registry/`, `hrms/install.py` | Install + uninstall (retain rows) + advisory lock + failed retry. Upgrade/configure still thin. |
| HRMS Leave | Implemented | `hrms/` models, services, views, tests; Leave UI | Person-based scopes (own/manage/company), balances, uninstall→404. Attendance/payroll Missing. |
| Custom fields + custom entities | Implemented | `tenants` custom_* + [13-dynamic-data-model.md](13-dynamic-data-model.md) | — |
| In-app notifications | Partial | models under `tenants` | Not a separate `notifications` Django app. Outbound email for preference events: Unverified. |
| Dashboards / nav gating | Partial | `dashboards/services.py` `navigation_for` | Permission + install gating implemented. Studio depth vs docs may lag. |
| Append-only audit log | Implemented | `audit/models.py` | Company and platform list APIs present. |
| Composite tenant FKs in PostgreSQL | Partial | `tenants/migrations/0013_*`, `0014_*` + `(company,id)` uniques | Applied for critical org/HRMS/custom-entity/Party/Projects/CRM/Commerce pairs. App filters remain required. |
| Application record scopes (own/dept/LE) | Partial | `authorization/scopes.py`, role `record_scopes` | Leave own/manage/company enforced. Department-manager `people.update` object rule still open. |
| Cross-tenant isolation tests | Partial | org/auth + `authorization/tests/test_tenant_isolation.py`, `hrms/tests`, `projects/tests` | Expanded for leave/projects; not every surface. |
| PostgreSQL RLS | Planned | ADR-016, `06` | Separate readiness decision; **not** approved for immediate enablement. |
| `background_tasks` / DB-backed jobs | Missing | ADR-015 | No app/models found. |
| LegalEntity | Planned | ADR-019 | Approved direction; models/fields TBD. |
| Employment (HRMS) | Planned | ADR-019 | Approved direction; leave still on Person. |
| Shared Party | Implemented | `apps.parties` | Core Party CRUD; used by CRM convert and Commerce orders. |
| CRM / Projects / Commerce | Implemented | `apps.crm`, `apps.projects`, `apps.commerce` + installable catalog | Vertical slices with nav/permissions/isolation basics. |
| Inventory / Procurement / Sales / Finance / Helpdesk | Missing | Catalog stubs (`installation_available=False`) | Roadmap later; depend on Party / LegalEntity / Product as applicable. |

## 4. Catalog placeholders versus apps

Installable: `hrms`, `projects`, `crm`, `commerce`.

Non-installable catalog stubs: `finance`, `inventory`, `procurement`, `sales`, `helpdesk`.

## 5. Documentation reconciliation notes

- [README.md](../../README.md) “Current limits” previously claimed invitations, people, roles, and module installation were unimplemented—that claim was stale.
- Deleted path `backend/MODEL_DIFFERENCES.md` is no longer referenced; use this file and the ADR index instead.
- Permission catalog in [05-identity-and-authorization.md](05-identity-and-authorization.md) lists `notifications.view`; code does not seed it (`authorization/catalog.py`).
- Growth entitlement `max_people` is seeded; person-create enforcement is not verified as implemented.
- Access mode: code currently treats `grace` similarly to `full` for many company permissions—possible mismatch with billing docs (Unresolved).

## 6. Unresolved topics (explicit)

Phase 1 freeze closed Branch (org units v1), record-scope approach (service + role metadata), Leave/Employment sequencing, and provisional Party / LegalEntity ownership—see [12-architecture-decisions.md](12-architecture-decisions.md) §3. Those designs are **not Implemented**.

Still open:

1. **RLS timing:** scaffolding during integrity work versus enablement only at the production gate (ADR-016 governs enablement).
2. **Grace access:** code treats `grace` like `full` for many non-billing permissions; docs/matrix may differ—mismatch documented, no silent fix ([17](17-authorization-and-tenant-integrity.md)).
3. **Field-level designs / migrations** for LegalEntity, Employment, Party—implementation review required before coding.
4. **Default LegalEntity** strategy; Employment uniqueness/active rules; disable-vs-uninstall; role scope metadata storage shape; `apps.parties` convention validation ([18](18-module-boundaries-and-roadmap.md)).
5. **When** a first-class Branch/Location model becomes necessary (deferred past v1).
6. **Production billing/legal items** in [12-architecture-decisions.md](12-architecture-decisions.md) §3 (Razorpay, GST, retention, invoice format, Employee `people.view` breadth).
