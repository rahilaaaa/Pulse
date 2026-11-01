# 12 — Architecture Decisions

Status: approved decisions index, with implementation labels reconciled in Phase 0. If another document conflicts with an explicit decision here, this file wins. Column-level **target** proposals live in [schema.dbml](schema.dbml); that file is an intended design sketch, not automatic approval of every table or field for implementation. For what exists in code today, see [14-implementation-status.md](14-implementation-status.md).

Implementation labels used below: **Implemented**, **Partial**, **Planned**, **Missing**. Labels describe repository reality; they do not weaken the decision text.

## 1. Accepted decisions

### ADR-001. Modular monolith — Implemented (shape)

Pulse ships as one Django REST application, one React SPA, one PostgreSQL database, and one database-backed worker. Optional products are trusted Django apps in the same repository. Microservices, Kubernetes, and remotely deployed plugins are deferred until operations require them.

Worker / `background_tasks`: Missing (see ADR-015).

### ADR-002. Shared schema multi-tenancy — Partial

All tenants share one schema. Tenant-owned rows have `company_id`. Children of tenant-owned parents are **intended** to use composite foreign keys. A tenant queryset should refuse to run without a company context.

**As built:** application code filters by `company_id`. Critical composite `(company_id, parent_id)` FKs ship in PostgreSQL migrations (`tenants.0013`, `tenants.0014`) for org/HRMS/custom-entity/Party/Projects/CRM/Commerce pairs; app filters remain required.

### ADR-003. Multiple company memberships — Implemented

A global `users` row may have many `company_memberships`. The active tenant is the company id in the URL after a membership check. The product can still onboard one company at a time. Identity is not stored as "the user's company."

Consequence: invitations, sessions, and queries must carry the company explicitly. A user who is an owner of one company has no implied rights in another.

**As built:** workspace shell also stores `active_company_id` in the session for company switching; company APIs still require path `company_id` plus membership.

### ADR-004. Separate person records — Implemented

`people` is the employee directory. Membership optionally links one person in the same company. A person may exist without a login. Deactivating a user does not delete the person.

Employment as a separate relationship is ADR-019 (Planned).

### ADR-005. Session cookies — Implemented

Browsers authenticate with Django sessions: `HttpOnly`, `Secure`, `SameSite=Lax`, CSRF on unsafe methods, Argon2 password hashes. Tokens are not stored in browser local storage in the MVP.

### ADR-006. Permission codes, not role names — Implemented

Company authorization checks codes such as `people.view`. Templates seed Owner, Administrator, HR Manager, Department Manager, and Employee. Custom roles are allowed. The owner role has a permission floor and the company must keep one active owner. Platform grants live in `platform_permission_grants` and use a separate scope. Company role assignment cannot create them.

**As built:** owner floor in code includes `custom_entities.manage` in addition to `company.update`, `roles.manage`, `billing.manage`, and `membership.invite`. Record scopes use service helpers + role `record_scopes` (Leave own/manage/company Implemented; broader families still expanding).

### ADR-007. INR minor units — Partial

The only enabled currency is `INR`. Amounts are `bigint` paise. Currency is still a column on prices, subscriptions, items, invoices, payments, and refunds so another currency can be added later without replacing the billing tables. Historical snapshots do not change when the catalog changes.

**As built:** plan prices and subscriptions use INR paise. Invoice/payment/refund tables and flows: Missing / not verified as shipped.

### ADR-008. One current subscription and a shared interval — Partial

A company has one non-canceled subscription. Optional modules are subscription items on that subscription's `month` or `year` interval. Interval changes happen at period end. Independent module billing cycles are deferred.

**As built:** one open subscription and plan entitlements (including `included_module_slugs`) work for trial/Growth. Paid module subscription items as a commercial path: Partial / incomplete.

### ADR-009. Provider-neutral billing with Razorpay as the first adapter — Missing (adapter)

`billing` owns statuses and invoices. `billing_razorpay` maps Razorpay webhooks and checkouts onto the provider interface. Paid `active` is set only after signature verification, idempotent event storage, and a provider read-back. The browser redirect does not activate a paid subscription.

Pulse keeps its own invoice, line, and tax-component snapshots. Provider invoices do not replace them.

**As built:** no `billing_razorpay` app; no live checkout activation path.

### ADR-010. Tax rates are data — Planned / Missing in runtime

`platform_tax_rates` stores basis points and supply scope. No GST rate is hardcoded. Positive tax invoices are refused while no active rate matches. Trial access does not require those rates.

### ADR-011. Trusted modules and retained data — Partial

Installation is a data transition, not DDL and not an upload of customer code. The first module is HRMS Leave. Install checks permission, entitlement, dependencies, and compatibility, and it does not grant permissions. Uninstall keeps business rows. CRM and Commerce have no tables yet.

**As built:** install + advisory lock + HRMS Leave seed implemented. Uninstall/upgrade/configure services Missing though permission codes exist. Catalog stubs for some future modules; Commerce not in catalog.

### ADR-012. Controlled dashboards — Partial

Widgets are a trusted catalog. Layouts are validated JSON. Publishing versions a configuration. Widget data endpoints repeat tenant, permission, module, and entitlement checks.

### ADR-013. Derived access mode — Partial

Company lifecycle, subscription status, invoice status, payment status, and refund status stay distinct. Workspace access is computed with the matrix in [08-subscriptions-and-billing.md](08-subscriptions-and-billing.md). It is not a stored third status.

**As built:** access mode helpers exist. Possible mismatch: application code may treat `grace` like `full` for many company permissions (Unresolved—see §3).

### ADR-014. MRR formula — Planned (operator metrics)

Committed MRR is the pre-tax sum of active items on `active` subscriptions. Annual amounts are divided by 12 with integer division, and the remainder is reported as a residual. Taxes, prorations, invoice discounts, and refunds are outside that figure. The full rules are in [10-platform-administration.md](10-platform-administration.md).

### ADR-015. Database-backed jobs — Missing

Email, install follow-up, grace expiry, and renewal scheduling use `background_tasks`. Redis and Celery are deferred.

### ADR-016. Row-Level Security before the first production customer — Planned (enablement gated)

RLS is specified as fail-closed defense in depth, with `SET LOCAL`, a non-owner application role, and forced RLS. It is not an acceptance criterion of the four-week MVP. A real customer waits until the prerequisites and migration risks in [06-multi-tenancy-and-security.md](06-multi-tenancy-and-security.md) are handled.

**Phase 0 clarification:** RLS remains a **separate readiness and rollout decision**. It is **not** approved for immediate implementation or enablement. ADR-021’s Projects/CRM gate does **not** require enabling RLS.

### ADR-017. Refund execution is an operator action — Planned

Companies can view refunds. Creating a refund requires `platform.billing.manage`, an idempotency key, and a captured payment. Cancellation does not imply a refund.

### ADR-018. Metadata custom fields and shared custom-entity records — Implemented

Company-defined attributes on fixed core entities use a definition table plus JSONB `custom_data`. Tenant-defined entities use shared `custom_entities` / `custom_entity_fields` / `custom_entity_records` tables (JSONB values), never per-tenant DDL or one Postgres table per field. Lifecycle columns such as invitation `accepted_at` remain system-owned. See [13-dynamic-data-model.md](13-dynamic-data-model.md).

### ADR-019. LegalEntity and Employment — Planned (direction approved)

**Approved 2026-10-27.**

- `Company` remains the SaaS tenant boundary.
- A company may have zero or more **LegalEntity** children (books / statutory boundary). Exact fields, uniqueness, and UI are **not** finalized in Phase 0.
- **Employment** is an HRMS-owned relationship linking a company **Person** to a LegalEntity (dates, status, reporting, and related HR facts). Concurrent employment across legal entities within one tenant is an explicit goal.
- Login remains `User`; workspace access remains `CompanyMembership`; directory identity remains `Person`. These are not interchangeable with Employment.
- Leave and other HRMS facts should eventually attach to Employment rather than treating Person as the employment record.

**Approved sequencing (Phase 1 freeze; design only—not Implemented):**

1. Harden current **Person-based** Leave.  
2. **Design** Employment (and LegalEntity prerequisites).  
3. Perform a **separate, explicitly approved**, backward-compatible Leave→Employment migration later.

**Unresolved** under this ADR means final fields, mapping rules, migration mechanics, validation/rollback tooling, and other implementation details—**not** the sequencing above. See [18-module-boundaries-and-roadmap.md](18-module-boundaries-and-roadmap.md) §4.3.

Do not invent final model fields, migrations, or API contracts here.

**See also (Phase 1 design freeze):** [15-shared-domain-model.md](15-shared-domain-model.md), [18-module-boundaries-and-roadmap.md](18-module-boundaries-and-roadmap.md).

### ADR-020. Shared Party for external partners — Partial (core Implemented)

**Approved 2026-10-27.**

- Introduce a shared core **Party** abstraction for external organizations and people used by CRM, Commerce, Procurement, and related modules.
- A Pulse `Company` (tenant) must **not** be reused as a CRM Account or commerce customer identity.
- CRM Account / Contact and commerce Customer should reference Party (and related records), not invent a second global user table.
- Exact Party subtypes, fields, and merge/dedup rules require further design and review.

Do not invent final model fields, migrations, or API contracts here.

**See also (Phase 1 design freeze):** [15-shared-domain-model.md](15-shared-domain-model.md), [18-module-boundaries-and-roadmap.md](18-module-boundaries-and-roadmap.md). Party provisional app home: `apps.parties` (convention validation still required).

### ADR-021. Tenant-integrity gate before Projects and CRM — Partial (foundations Implemented)

**Approved 2026-10-27.**

Before implementing Project Management or CRM product tables and installable modules, the following foundations must be completed:

1. Audit existing data for cross-tenant reference defects.
2. Application-level record-scope enforcement where the product requires it (at minimum leave and similar “own vs manage” paths).
3. Automated tenant-isolation tests covering the surfaces in scope.
4. Appropriate composite database constraints for tenant-safe parent/child relationships (aligned with ADR-002 intent).

PostgreSQL **RLS** remains under ADR-016 as a separate production readiness decision. Completing ADR-021 does **not** by itself authorize enabling RLS.

Detailed constraint lists, migration order, and scope-encoding storage shape require further review (Unresolved). Phase 1 freeze chooses **action codes + service-layer scope evaluation + role scope metadata** (not permission-suffix explosion); see [17-authorization-and-tenant-integrity.md](17-authorization-and-tenant-integrity.md).

**See also (Phase 1 design freeze):** [16-module-platform-contract.md](16-module-platform-contract.md), [17-authorization-and-tenant-integrity.md](17-authorization-and-tenant-integrity.md), [18-module-boundaries-and-roadmap.md](18-module-boundaries-and-roadmap.md).

## 2. Recommendations that are not product law yet

| Topic | Recommendation | Confirm by |
| --- | --- | --- |
| Trial length | 14 days when `trial_days` is set | Before the first public plan is priced |
| Grace period | 7 days in `platform_settings` | Before renewal billing is shown to customers |
| Trial and mandates | Pulse-local trial; create the provider subscription at conversion | Before the Razorpay adapter is coded |
| Retention | Invoices at least eight years; security audit at least two years | Counsel, before production data exists |
| UI kit | Vite, React Router, TanStack Query, React Hook Form, Zod, Tailwind, Radix | At implementation start, with pinned versions |
| Backend line | Python 3.12, Django 5.2 LTS, DRF, drf-spectacular, PostgreSQL 16 | At implementation start, with pinned versions |

## 3. Unresolved items

These are blocking for production billing or for a live adapter, or are open product/architecture choices. They are not resolved by Phase 0 documentation.

### Billing and legal (existing)

1. Razorpay merchant eligibility, Subscriptions enablement, and whether yearly plans are allowed on that account.
2. Which payment methods will be offered, given that not every Indian method supports recurring collection.
3. Whether conversion uses Razorpay Subscriptions or Pulse-scheduled orders. The domain interface supports either.
4. Operator GST registration, SAC, rates, place of supply, invoice series, and credit-note rules. See [08-subscriptions-and-billing.md](08-subscriptions-and-billing.md).
5. Refund policy window for customers. Who may execute a refund is already decided.
6. Final invoice number format.
7. Legal retention periods if they differ from the recommendations above.
8. Whether Employee should keep company-wide `people.view`. The MVP template includes it.

### Multi-module architecture

**Phase 1 freeze decisions (design only; not implemented):**

9. **Branch (v1):** reuse organization-unit approach; no dedicated Branch model yet ([15](15-shared-domain-model.md)).
10. **Record scopes:** preserve action permission codes; shared service-layer scope evaluation + role scope metadata ([17](17-authorization-and-tenant-integrity.md)). Storage shape of metadata remains open.
11. **Employment / Leave sequencing (approved):** (1) harden Person-based Leave; (2) design Employment; (3) separate explicitly approved backward-compatible migration later. Unresolved items are fields/mechanics—not this order ([18](18-module-boundaries-and-roadmap.md) §4.3).
12. **Party ownership (provisional):** new shared core app `apps.parties`, subject to repository-convention validation.
13. **LegalEntity ownership (provisional):** under `apps.tenants` initially.
14. **Projects ↔ Employment:** ADR-021 is the hard gate for Projects/CRM. Employment is required only for Projects features that need employment-linked or LE semantics; otherwise Person may suffice ([18](18-module-boundaries-and-roadmap.md)).
15. **Leave scope RACI:** Slice A = shared contract + isolation foundations + acceptance criteria; Slice B = Person Leave `own/manage` implementation + module tests; both must pass for ADR-021 leave-scope satisfaction ([17](17-authorization-and-tenant-integrity.md) §6.1).

**Still unresolved:**

16. **RLS timing:** scaffolding during integrity work versus enablement only at the production gate (ADR-016 governs enablement).
17. **Grace access:** current code treats `grace` like `full` for many non-billing permissions; billing docs may differ—mismatch documented, no silent policy choice ([17](17-authorization-and-tenant-integrity.md)). **Do not resolve without an explicit decision.**
18. Final field designs and migration contracts for LegalEntity, Employment, and Party (including Leave cutover mapping/validation/rollback tooling)—require implementation design review before coding.
19. Default LegalEntity strategy for existing companies; Employment uniqueness/active rules; disable-vs-uninstall product distinction; zero/multi-Employment cutover UX ([18](18-module-boundaries-and-roadmap.md)).

## 4. Consequences called out on purpose

- Multi-company users make every tenant query explicit. That is more code than a single-company user column, and it avoids a later migration of identity.
- Shared schema makes backups one database and makes a missing filter dangerous. Composite keys, tests, and later RLS are the compensation.
- Shipping module tables before install makes deployment simple and means unused modules still have empty tables.
- Keeping provider code behind an interface adds a package and keeps Razorpay status strings out of invoices and MRR.
- Integer annual MRR can disagree with catalog annual totals by a few paise per item. The residual field is the reconciliation, not a second definition of revenue.
- Deferring RLS during the four-week build means production launch has a hardening gate. The MVP tests do not pretend that gate is already closed.
- ADR-021 delays Projects and CRM until tenant-integrity foundations are done, reducing the cost of fixing cross-tenant defects after those modules ship.

## 5. Labels

- **Mandatory security requirement:** server-side permission checks, tenant-scoped object access, no platform rights through company roles, hashed single-use tokens, webhook signature and idempotency, no paid activation from the browser, append-only audit, secrets outside the repository, RLS before the first production customer (ADR-016 readiness—not an instruction to enable RLS in Phase 0 or Phase 1).
- **Assumption:** multi-company memberships, one current subscription, shared module interval, INR only, HRMS Leave as the first module, session authentication, operator-executed refunds.
- **Recommendation:** 14-day local trial, 7-day grace, Razorpay as the first adapter, database-backed jobs, the UI and backend version lines above.
- **Approved direction still expanding:** LegalEntity + Employment (ADR-019). Party core + ADR-021 integrity foundations + Projects/CRM/Commerce vertical slices are in code; Inventory/Procurement/Sales/Finance/Support remain later stubs.
