# 12 — Architecture Decisions

Status: approved planning baseline. This file is the index of decisions. If another document conflicts with an explicit decision here, this file wins. If a column conflicts, [schema.dbml](schema.dbml) wins until this file is updated with it.

## 1. Accepted decisions

### ADR-001. Modular monolith

Pulse ships as one Django REST application, one React SPA, one PostgreSQL database, and one database-backed worker. Optional products are trusted Django apps in the same repository. Microservices, Kubernetes, and remotely deployed plugins are deferred until operations require them.

### ADR-002. Shared schema multi-tenancy

All tenants share one schema. Tenant-owned rows have `company_id`. Children of tenant-owned parents use composite foreign keys. A tenant queryset refuses to run without a company context.

### ADR-003. Multiple company memberships

A global `users` row may have many `company_memberships`. The active tenant is the company id in the URL after a membership check. The product can still onboard one company at a time. Identity is not stored as "the user's company."

Consequence: invitations, sessions, and queries must carry the company explicitly. A user who is an owner of one company has no implied rights in another.

### ADR-004. Separate person records

`people` is the employee directory. Membership optionally links one person in the same company. A person may exist without a login. Deactivating a user does not delete the person.

### ADR-005. Session cookies

Browsers authenticate with Django sessions: `HttpOnly`, `Secure`, `SameSite=Lax`, CSRF on unsafe methods, Argon2 password hashes. Tokens are not stored in browser local storage in the MVP.

### ADR-006. Permission codes, not role names

Company authorization checks codes such as `people.view`. Templates seed Owner, Administrator, HR Manager, Department Manager, and Employee. Custom roles are allowed. The owner role has a permission floor and the company must keep one active owner. Platform grants live in `platform_permission_grants` and use a separate scope. Company role assignment cannot create them.

### ADR-007. INR minor units

The only enabled currency is `INR`. Amounts are `bigint` paise. Currency is still a column on prices, subscriptions, items, invoices, payments, and refunds so another currency can be added later without replacing the billing tables. Historical snapshots do not change when the catalog changes.

### ADR-008. One current subscription and a shared interval

A company has one non-canceled subscription. Optional modules are subscription items on that subscription's `month` or `year` interval. Interval changes happen at period end. Independent module billing cycles are deferred.

### ADR-009. Provider-neutral billing with Razorpay as the first adapter

`billing` owns statuses and invoices. `billing_razorpay` maps Razorpay webhooks and checkouts onto the provider interface. Paid `active` is set only after signature verification, idempotent event storage, and a provider read-back. The browser redirect does not activate a paid subscription.

Pulse keeps its own invoice, line, and tax-component snapshots. Provider invoices do not replace them.

### ADR-010. Tax rates are data

`platform_tax_rates` stores basis points and supply scope. No GST rate is hardcoded. Positive tax invoices are refused while no active rate matches. Trial access does not require those rates.

### ADR-011. Trusted modules and retained data

Installation is a data transition, not DDL and not an upload of customer code. The first module is HRMS Leave. Install checks permission, entitlement, dependencies, and compatibility, and it does not grant permissions. Uninstall keeps business rows. CRM and Commerce have no tables yet.

### ADR-012. Controlled dashboards

Widgets are a trusted catalog. Layouts are validated JSON. Publishing versions a configuration. Widget data endpoints repeat tenant, permission, module, and entitlement checks.

### ADR-013. Derived access mode

Company lifecycle, subscription status, invoice status, payment status, and refund status stay distinct. Workspace access is computed with the matrix in [08-subscriptions-and-billing.md](08-subscriptions-and-billing.md). It is not a stored third status.

### ADR-014. MRR formula

Committed MRR is the pre-tax sum of active items on `active` subscriptions. Annual amounts are divided by 12 with integer division, and the remainder is reported as a residual. Taxes, prorations, invoice discounts, and refunds are outside that figure. The full rules are in [10-platform-administration.md](10-platform-administration.md).

### ADR-015. Database-backed jobs

Email, install follow-up, grace expiry, and renewal scheduling use `background_tasks`. Redis and Celery are deferred.

### ADR-016. Row-Level Security before the first production customer

RLS is specified as fail-closed defense in depth, with `SET LOCAL`, a non-owner application role, and forced RLS. It is not an acceptance criterion of the four-week MVP. A real customer waits until the prerequisites and migration risks in [06-multi-tenancy-and-security.md](06-multi-tenancy-and-security.md) are handled.

### ADR-017. Refund execution is an operator action

Companies can view refunds. Creating a refund requires `platform.billing.manage`, an idempotency key, and a captured payment. Cancellation does not imply a refund.

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

These are blocking for production billing or for a live adapter. They are not blocking for the planning set, and several are not blocking for the four-week fake-provider milestone.

1. Razorpay merchant eligibility, Subscriptions enablement, and whether yearly plans are allowed on that account.
2. Which payment methods will be offered, given that not every Indian method supports recurring collection.
3. Whether conversion uses Razorpay Subscriptions or Pulse-scheduled orders. The domain interface supports either.
4. Operator GST registration, SAC, rates, place of supply, invoice series, and credit-note rules. See [08-subscriptions-and-billing.md](08-subscriptions-and-billing.md).
5. Refund policy window for customers. Who may execute a refund is already decided.
6. Final invoice number format.
7. Legal retention periods if they differ from the recommendations above.
8. Whether Employee should keep company-wide `people.view`. The MVP template includes it.

## 4. Consequences called out on purpose

- Multi-company users make every tenant query explicit. That is more code than a single-company user column, and it avoids a later migration of identity.
- Shared schema makes backups one database and makes a missing filter dangerous. Composite keys, tests, and later RLS are the compensation.
- Shipping module tables before install makes deployment simple and means unused modules still have empty tables.
- Keeping provider code behind an interface adds a package and keeps Razorpay status strings out of invoices and MRR.
- Integer annual MRR can disagree with catalog annual totals by a few paise per item. The residual field is the reconciliation, not a second definition of revenue.
- Deferring RLS during the four-week build means production launch has a hardening gate. The MVP tests do not pretend that gate is already closed.

## 5. Labels

- **Mandatory security requirement:** server-side permission checks, tenant-scoped object access, no platform rights through company roles, hashed single-use tokens, webhook signature and idempotency, no paid activation from the browser, append-only audit, secrets outside the repository, RLS before the first production customer.
- **Assumption:** multi-company memberships, one current subscription, shared module interval, INR only, HRMS Leave as the first module, session authentication, operator-executed refunds.
- **Recommendation:** 14-day local trial, 7-day grace, Razorpay as the first adapter, database-backed jobs, the UI and backend version lines above.
