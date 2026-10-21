# 00 — Product Vision and Requirements

Status: approved planning baseline. This document does not authorize implementation.

## 1. Product vision

Pulse is a modular, multi-tenant business operating platform. A company registers, subscribes, configures its organization, manages people, assigns permissions, installs the business modules it needs, and customizes dashboards.

Pulse itself is the core platform. Optional modules integrate with that core. They do not implement their own authentication, tenant management, authorization, billing, or shared platform services.

The long-term product can grow HRMS, CRM, Commerce, and later modules. The first release is a modular monolith with one minimal HRMS Leave module. CRM and Commerce are extension points, not MVP deliveries.

## 2. Primary areas

### 2.1 Public website and onboarding

A new customer completes this journey without manual database edits:

1. Public landing page.
2. Account registration and login.
3. Email verification.
4. Password recovery.
5. Company creation and profile setup, including billing name, address, and GSTIN where applicable.
6. Subscription plan selection (monthly or annual).
7. Checkout and payment-status display.
8. Onboarding progress that can be resumed.
9. Entry into the company workspace.

### 2.2 Company workspace

Each company has an isolated workspace:

- Company overview.
- Organization and department management.
- Employee and person management.
- User memberships and invitations.
- Role and permission management.
- Module catalog, installation, and configuration.
- Subscription and billing management.
- Dashboard Studio.
- Employee dashboards.
- Notifications and audit history.

Navigation shows only installed modules and permissions the signed-in membership actually has. Hidden navigation is not a security control.

### 2.3 Platform administration

`/platform` is the private console for the Pulse operator. It is separate from company administration.

It covers company lifecycle and counts, global users, memberships, and people as distinct metrics, subscription and renewal status, monthly and annual plans, recurring revenue, module adoption, payments, invoices, refunds, failed webhooks, failed background tasks, usage and quotas, audit logs, and platform health.

A company role assignment never grants platform permissions. The MVP does not include customer impersonation.

## 3. Users and tenants

These concepts stay separate:

| Concept | Meaning |
| --- | --- |
| Global user | One login identity, identified by email. |
| Company | The tenant. |
| Company membership | The user's access to one company. |
| Person | An employee or directory record owned by one company. A person may have no login. |
| Company role | A named bundle of permission codes inside one company. |
| Permission | A stable authorization code such as `people.view`. |
| Platform grant | An operator permission stored apart from company roles. |

A user may belong to multiple companies. The active company is the company id in the API path, accepted only when that user has an active membership.

## 4. MVP requirements

The four-week MVP is one coherent journey for one developer, not a finished commercial SaaS product.

Included:

- Landing, registration, email verification, login, logout, password reset.
- Multi-company membership model, with a practical single-company onboarding path.
- Company profile and Indian billing profile fields.
- Monthly and annual company subscriptions in INR, integer paise, one current subscription per company.
- Trial subscriptions when a plan enables them, managed by Pulse until a provider subscription exists.
- Provider-neutral billing with Razorpay evaluated as the first adapter.
- Plan entitlements and limits, including employee limits.
- Optional module prices on the same billing interval as the company subscription.
- Invoices that snapshot price, tax, description, and period. Pulse invoice records are authoritative for the product even if the provider also shows a receipt.
- People, departments, invitations, system role templates, and custom company roles.
- Module registry and a minimal HRMS Leave module.
- Dashboard Studio with predefined widgets, drafts, publish, and role or individual assignment.
- Platform admin read models for the metrics in section 2.3, including a documented MRR figure.
- Server-side tenant isolation, permission checks, webhook signature verification, and idempotent payment processing.
- Automated isolation and authorization checks inside each implementation task.

## 5. Explicitly deferred

- CRM and Commerce implementations and their tables.
- Customer-uploaded or remotely deployed plugins.
- Microservices, Kubernetes, and a distributed plugin marketplace.
- PostgreSQL Row-Level Security enforcement. Policies are a production requirement and are specified now; enabling them is pre-production work, not a four-week promise.
- Additional payment providers, non-INR currencies, and a tax engine beyond snapshotted components.
- Self-serve data export and erasure automation. The retention model is specified; the product workflow is later.
- SSO, SCIM, API keys, and impersonation.
- Unrestricted dashboard scripting or visual programming.
- Full HRMS beyond leave policies and leave requests.
- Production-grade GST invoicing, e-invoice IRN, and credit-note PDFs. The schema is ready; legal and accounting confirmation is still required before paid production use.
- Card-on-file trials that depend on a Razorpay mandate. See unresolved items.
- Advanced dunning sequences, coupon engines, and independent module billing cycles.

## 6. Non-functional requirements

- The backend is the authority for authentication, tenant scope, permissions, module availability, entitlements, and billing.
- The frontend orchestrates screens and does not choose the tenant or grant access.
- Historical invoices, payments, and subscription item prices do not change when the catalog price changes.
- Paid workspace access changes only after a verified, idempotently stored payment event. A browser redirect never activates a paid subscription.
- Monetary amounts are integers in minor units (paise for INR). Floating-point money is forbidden.
- Secrets stay out of the repository.

## 7. Requirement labels

Throughout the planning set:

- **Mandatory security requirement** — required before the first real customer.
- **Recommendation** — proposed default for implementation.
- **Assumption** — a product choice already made for the MVP and recorded so it can be revisited.
- **Unresolved** — blocks production billing or a specific adapter, and does not block writing the planning set.

## 8. Assumptions already accepted

- Shared PostgreSQL schema with `company_id` ownership, not a database-per-tenant.
- One global user, many memberships.
- One current subscription per company.
- Module add-on billing uses the company's current interval (month or year).
- INR is the only enabled currency. The schema still stores currency on every money row so a later currency does not replace the billing model.
- The first optional module is HRMS Leave.
- Trusted Django apps inside this repository are the only modules.
- Browser authentication will use server-side sessions. See [05-identity-and-authorization.md](05-identity-and-authorization.md) and [12-architecture-decisions.md](12-architecture-decisions.md).

## 9. Unresolved items that affect the product

These are tracked in [12-architecture-decisions.md](12-architecture-decisions.md) and expanded in the billing and security documents:

1. Razorpay merchant eligibility for Subscriptions, e-mandate, UPI Autopay, and cards.
2. Whether a no-mandate trial is required, given that many recurring methods authorize a mandate at checkout.
3. Operator GST registration, SAC code, tax rates, place-of-supply treatment, and whether Pulse must issue its own tax invoice.
4. Default grace-period length (planning recommendation: 7 days, configurable).
5. Default trial length (planning recommendation: 14 days on a plan that sets `trial_days`).
6. Refund policy window and who may execute a refund (planning recommendation: platform operator executes; companies can view).
7. Data-retention durations that need legal confirmation (planning recommendation documented in the database design).
