# 11 — Four-Week Implementation Roadmap

Status: approved planning baseline. This roadmap starts only after an explicit request to implement. It assumes one developer. It does not produce a complete production SaaS platform.

Estimates are focused days, about 20 days across four weeks. Each task includes its automated checks. There is no separate testing week.

## 1. MVP outcome

At the end of week 4, one company can register, verify email, create a company, select a monthly or annual INR plan, enter a Pulse-managed trial, pass a verified test payment through the provider interface, invite a person, assign a role, install HRMS Leave, publish a role dashboard, and see platform counts and MRR computed from subscription items.

Production GST invoices, Row-Level Security enforcement, live recurring mandates, CRM, and Commerce are outside this outcome.

## 2. Week 1 — Foundation, identity, tenant, onboarding

### Task 1. Project skeleton

- Priority: P0. Effort: 1 day. Depends on: nothing.
- Deliverables: `backend/` and `frontend/` layout from [02-project-structure.md](02-project-structure.md), Django settings split, DRF, drf-spectacular, Vite React TypeScript shell, documented local PostgreSQL, environment template with secrets untracked.
- Acceptance: API health route and SPA shell run locally; OpenAPI document generates; `X-Request-Id` and the error body from [04-api-design.md](04-api-design.md) exist.
- Security check: secret values are not committed; CORS allowlist is explicit.

### Task 2. Identity

- Priority: P0. Effort: 1.5 days. Depends on: task 1.
- Deliverables: custom `users` model, Argon2, register, login, logout, me, email verification, password reset, session cookie flags.
- Acceptance: the auth routes in [04-api-design.md](04-api-design.md) behave as specified, including identical errors for unknown emails.
- Security check: throttles on register, login, resend, and reset; only token hashes are stored; session key rotates on login.

### Task 3. Tenants

- Priority: P0. Effort: 1.5 days. Depends on: task 2.
- Deliverables: `companies`, `company_memberships`, tenant context from the URL, membership required.
- Acceptance: a user can belong to two companies; each URL authorizes only that membership.
- Security check: automated test that company A cannot read company B.

### Task 4. Onboarding

- Priority: P0. Effort: 1 day. Depends on: task 3.
- Deliverables: `onboarding_states`, company profile, `company_billing_profiles` including GSTIN format check, resume API.
- Acceptance: a verified user creates a `draft` company and can leave and return at the first incomplete step. No subscription is marked `active`.
- Security check: onboarding company ids are scoped to the caller.

### Task 5. Audit and error consistency

- Priority: P0. Effort: 1 day. Depends on: task 3.
- Deliverables: append-only `audit_logs`, request id stored on audit rows.
- Acceptance: company creation writes an audit row. Update and delete of audit rows fail for the application role.
- Security check: cross-tenant audit reads return only the caller's company.

## 3. Week 2 — People, memberships, roles

### Task 6. Departments and people

- Priority: P0. Effort: 1.5 days. Depends on: task 3.
- Deliverables: `departments`, `people`, composite foreign keys. Company creation inserts the founder person and links the owner membership. Companies created before this task are backfilled.
- Acceptance: create, update, and deactivate stay inside the company. Employee codes are unique per company.
- Security check: a department from another company cannot be set as the parent or as a person's department.

### Task 7. Invitations

- Priority: P0. Effort: 1 day. Depends on: tasks 2 and 6.
- Deliverables: invitation create, email token, accept, revoke.
- Acceptance: accepting creates a membership for the verified email only. A second pending invite for the same company email conflicts.
- Security check: raw tokens are not stored or returned in the API.

### Task 8. Roles and permissions

- Priority: P0. Effort: 2 days. Depends on: task 3.
- Deliverables: permission seed, five templates, company role copy, custom roles, assignment API, last-owner rule, owner permission floor.
- Acceptance: authorization uses permission codes. `platform.billing.view` cannot be saved on a company role.
- Security check: tests for last owner, platform-code rejection, and object-level department manager updates.

### Task 9. Access policy and workspace bootstrap

- Priority: P0. Effort: 1 day. Depends on: tasks 4 and 8.
- Deliverables: access-mode function implementing the matrix in [08-subscriptions-and-billing.md](08-subscriptions-and-billing.md), `GET .../workspace`.
- Acceptance: `draft` without a subscription is `onboarding_only`. Suspended is `blocked`. The bootstrap lists permissions and installed modules.
- Security check: a caller in `billing_only` cannot create a person.

### Task 10. Workspace SPA

- Priority: P0. Effort: 1.5 days. Depends on: tasks 2, 4, 7, 8, and 9.
- Deliverables: public landing, auth screens, onboarding screens, workspace shell, people and role screens wired to the API.
- Acceptance: the founder can complete onboarding UI through plan selection against the API. Hidden buttons are not the only guard; the API tests from earlier tasks still pass.
- Security check: the company switcher only lists memberships returned by `GET /companies`.

## 4. Week 3 — Billing, modules, HRMS

### Task 11. Billing domain

- Priority: P0. Effort: 2 days. Depends on: task 9.
- Deliverables: plans, monthly and annual INR prices, entitlements, subscriptions, items, invoice headers, lines, tax component table, status events. Seed prices in paise.
- Acceptance: changing a catalog price does not change an existing item snapshot. Interval on a module item must match the subscription. Access mode follows subscription status.
- Security check: invoice reads are tenant scoped; money columns are integers.

### Task 12. Provider interface and Razorpay boundary

- Priority: P0. Effort: 1.5 days. Depends on: task 11.
- Deliverables: provider interface from [08-subscriptions-and-billing.md](08-subscriptions-and-billing.md), in-memory fake provider used by tests, webhook route, idempotent `payment_provider_events`, subscription activation only inside that processor. Razorpay signature verification and status mapping live in `billing_razorpay` and are covered with fixture payloads.
- Acceptance: duplicate events do not double-capture. Invalid signatures do not change status. A client checkout GET does not set `active`. A fake `payment_captured` plus matching `fetch_payment` sets `active` and `paid`.
- Security check: the tests above. Live mandates, UPI Autopay coverage, and GST issuance are not acceptance criteria for this week.
- Note: if merchant eligibility is still unresolved, ship the fake provider and the signature-verified adapter mapping. Do not block the domain on a live Razorpay account.

### Task 13. Module registry and HRMS Leave

- Priority: P0. Effort: 1.5 days. Depends on: tasks 8 and 11.
- Deliverables: module definitions, installation state machine, advisory lock, HRMS policies and requests, permissions, routes.
- Acceptance: install requires `modules.install` and either an included slug or an active module item. Install grants no roles. Uninstall keeps leave rows and hides the API. HRMS does not require another module.
- Security check: company B cannot read company A's leave request. A user without `hrms.leave.request` receives `403`.

## 5. Week 4 — Dashboards, platform admin, journey

### Task 14. Dashboard Studio

- Priority: P0. Effort: 1.5 days. Depends on: tasks 8, 9, and 13.
- Deliverables: widget definitions, versions, publish, restore, assignments, `people.count`, `billing.subscription`, `hrms.leave.pending`.
- Acceptance: an employee resolves the role dashboard. A widget without permission is omitted and its data URL returns `403`.
- Security check: widget queries filter by `company_id` even when the dashboard id is manipulated.

### Task 15. Platform administration

- Priority: P0. Effort: 1.5 days. Depends on: tasks 5, 11, and 13.
- Deliverables: platform grants, company and user counts, subscription list, MRR query as defined in [10-platform-administration.md](10-platform-administration.md), failed webhook and task lists, usage summary, minimal `/platform` screens.
- Acceptance: annual items contribute `amount / 12` paise with the residual reported separately. Trials and refunds are outside committed MRR. A company owner without a platform grant receives `403`.
- Security check: platform responses exclude person-level private fields and secrets.

### Task 16. Grace, usage, and the journey test

- Priority: P0. Effort: 1 day. Depends on: tasks 12 through 15.
- Deliverables: `usage_records` snapshot, grace-expiry job, one automated end-to-end test of the journey in [04-api-design.md](04-api-design.md).
- Acceptance: the journey passes against the fake provider. Past-due inside grace is `grace`. After the job, status is `unpaid` and access is `billing_only`.
- Security check: the journey asserts tenant isolation on the created person and leave request.

## 6. Acceptance for the four-week milestone

- The journey in section 1 completes without manual database edits.
- Monthly and annual prices are both representable, and a company has one interval at a time.
- Paid `active` happens only after verified payment processing.
- Company roles cannot grant platform permissions.
- HRMS installs only with permission and entitlement, and it does not grant permissions.
- Dashboard widget data checks permission and tenant on its own.
- MRR matches the written formula on a fixture with one monthly item and one annual item.

## 7. Explicitly not promised in four weeks

- Production-ready GST invoices, e-invoice, or credit notes.
- A live Razorpay mandate, UPI Autopay for every bank, or settlement reconciliation beyond payment capture.
- Row-Level Security enabled in production. The design and prerequisites stay in [06-multi-tenancy-and-security.md](06-multi-tenancy-and-security.md). Enabling RLS is the first production-hardening task after the MVP, before a real customer.
- CRM, Commerce, SSO, API keys, impersonation, self-serve export and erasure.
- Coupon engine, independent module billing cycles, multi-currency charges.
- Visual dashboard programming.
- Kubernetes, microservices, and extra payment providers.

## 8. First ten implementation tasks, in order

1. Project skeleton.
2. Identity and sessions.
3. Companies, memberships, and tenant context.
4. Onboarding checklist and billing profile.
5. Audit log and cross-tenant tests.
6. Departments and people.
7. Invitations.
8. Roles, permissions, and the last-owner rule.
9. Access policy and workspace bootstrap.
10. SPA auth, onboarding, and workspace shell.

Billing, modules, dashboards, and platform admin follow those ten, in tasks 11 through 16.
