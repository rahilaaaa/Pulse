# 04 — API Design

Status: approved planning baseline. Resources map to [schema.dbml](schema.dbml) or to a derived read model named in this document. OpenAPI from drf-spectacular is an implementation deliverable at `/api/schema/` and `/api/docs/`. This file is the contract those views must follow.

## 1. Conventions

Base path: `/api/v1/`.

JSON request and response bodies. Timestamps are ISO-8601 UTC. Identifiers are UUID strings. Money fields are integers in minor units plus a `currency` code. The MVP emits `INR` and paise. Clients must not send floating-point money.

### 1.1 Authentication and tenant scope

Session cookie authentication. Unsafe methods require a CSRF token. Platform routes ignore company roles.

Tenant scope values used below:

- `none` — no company.
- `membership` — `company_id` in the path must match an `active` membership of the session user.
- `platform` — caller needs the named platform grant. No company membership is consulted.
- `webhook` — no session. The provider signature is the credential.

A missing or foreign object inside a company returns `404` with code `not_found`, so existence in another company is not revealed.

### 1.2 Correlation

Clients may send `X-Request-Id`. Otherwise the server generates a UUID. The response echoes it, and audit rows store it.

### 1.3 Errors

```json
{
  "error": {
    "code": "validation_error",
    "message": "The request is invalid.",
    "details": [
      {"field": "email", "code": "invalid", "message": "Enter a valid email address."}
    ],
    "request_id": "2b6f0c1e-1a4a-4e2a-9c1d-0a9a6b7c8d9e"
  }
}
```

| HTTP | `error.code` | When |
| --- | --- | --- |
| 400 | `validation_error` | Body or query fails validation. |
| 401 | `not_authenticated` | No valid session. |
| 403 | `permission_denied` | Membership is valid and the permission is missing. |
| 403 | `access_restricted` | Access mode blocks this route. `details` includes `access_mode`. |
| 403 | `email_unverified` | The action requires a verified email. |
| 404 | `not_found` | Unknown route or object outside the caller's scope. |
| 409 | `conflict` | Last owner, duplicate pending invite, concurrent installation, or idempotency replay with a different body. |
| 422 | `entitlement_required` | Plan or module entitlement does not allow the action. |
| 429 | `rate_limited` | Auth or write throttle. |
| 500 | `server_error` | Unexpected failure. No stack trace in the body. |

### 1.4 Pagination, filtering, and sorting

List responses:

```json
{"results": [], "page": 1, "page_size": 25, "count": 0}
```

`page` starts at 1. `page_size` defaults to 25 and cannot exceed 100. Unknown filter or sort fields return `400`. Sort is `sort=created_at` or `sort=-created_at`. Each endpoint lists its allowlist.

### 1.5 Idempotency

`Idempotency-Key` is required on checkout creation, module installation, plan change, module purchase, and refund creation. Replaying the same key and body returns the original result. The same key with a different body returns `409`. Webhooks are idempotent on `(provider, provider_event_id)` and do not use the client header.

### 1.6 Derived read models

These are not tables:

- `OnboardingProgress` from `onboarding_states` plus the current subscription status.
- `WorkspaceBootstrap` from membership, permissions, installations, subscription, and access mode.
- `ResolvedDashboard` from assignments, the published version, and widget visibility.
- `PlatformMetrics` from aggregate queries over companies, users, memberships, people, subscription items, invoices, payments, refunds, tasks, and provider events.

## 2. Authentication

All routes in this section are tenant scope `none`.

### POST /api/v1/auth/register

Create a global user. Does not create a company.

- Auth: no. Permission: none.
- Idempotency: no.
- Body: `{"email": "founder@example.com", "password": "a-long-passphrase", "first_name": "Asha", "last_name": "Menon"}`.
- Success `201`: `{"id": "uuid", "email": "founder@example.com", "first_name": "Asha", "last_name": "Menon", "email_verified": false}`.
- Validation: email normalized to lowercase; password length at least 6; email unique else `409` code `conflict`.
- Side effect: enqueue verification email. Rate limited.

### POST /api/v1/auth/login

- Auth: no.
- Body: `{"email": "founder@example.com", "password": "a-long-passphrase"}`.
- Success `200`: current user object as in `GET /auth/me`, and `Set-Cookie` for the session.
- Failure `401` code `not_authenticated` for unknown email or bad password. The message does not say which one.
- Inactive users receive the same `401`.

### POST /api/v1/auth/logout

- Auth: yes. Success `204`. Clears the session.

### GET /api/v1/auth/me

- Auth: yes. Success `200`:

```json
{
  "id": "uuid",
  "email": "founder@example.com",
  "first_name": "Asha",
  "last_name": "Menon",
  "email_verified": true,
  "memberships": [
    {"company_id": "uuid", "company_slug": "northwind", "company_display_name": "Northwind", "status": "active"}
  ],
  "platform_permissions": []
}
```

`platform_permissions` is empty unless `platform_permission_grants` exist. Company role names are not included here; the workspace bootstrap carries company permissions.

### POST /api/v1/auth/email-verifications

- Auth: yes. Success `202`: `{"status": "sent"}`. Always `202` even when already verified, to avoid extra account probing on a shared computer. Rate limited.

### POST /api/v1/auth/email-verifications/confirm

- Auth: no.
- Body: `{"token": "raw-token"}`.
- Success `200`: `{"email_verified": true}`.
- Invalid or expired token: `400` code `validation_error`. Used tokens fail the same way.
- Sets `users.email_verified_at` and `onboarding_states.email_verified_at` when a company checklist already exists.

### POST /api/v1/auth/password-resets

- Auth: no. Body: `{"email": "founder@example.com"}`. Success `202` whether or not the email exists. Rate limited.

### POST /api/v1/auth/password-resets/confirm

- Auth: no. Body: `{"token": "raw-token", "password": "a-new-long-passphrase"}`.
- Success `200`: `{"status": "reset"}`. Invalid token `400`. Password rules match registration.

### POST /api/v1/auth/password-changes

- Auth: yes. Body: `{"current_password": "...", "new_password": "..."}`.
- Success `200`: `{"status": "changed"}`. Wrong current password `400`.

## 3. Public catalog

### GET /api/v1/plans

- Auth: no. Tenant: none.
- Returns public active plans with active INR prices for `month` and `year`, trial days, and public entitlement keys.
- Success `200`:

```json
{
  "results": [
    {
      "code": "growth",
      "name": "Growth",
      "trial_days": 14,
      "prices": [
        {"billing_interval": "month", "currency": "INR", "amount_minor": 249900},
        {"billing_interval": "year", "currency": "INR", "amount_minor": 2499900}
      ],
      "entitlements": {"max_people": 50, "dashboards_enabled": true}
    }
  ]
}
```

Amounts are catalog prices, not a customer's snapshot.

### GET /api/v1/modules

- Auth: no. Public module definitions with active INR monthly and annual prices. No company installation state.

## 4. Onboarding

Auth: yes, and `email_verified` must be true for every route except `GET /api/v1/onboarding`. Tenant: the company created by this user, once it exists. Another user's company id is `404`.

### GET /api/v1/onboarding

Returns the checklist for the caller's in-progress company, or a null company if they have not created one.

```json
{
  "company_id": "uuid",
  "steps": {
    "email_verified": true,
    "company_created": true,
    "profile_completed": false,
    "billing_profile_completed": false,
    "plan_selected": false,
    "checkout_started": false,
    "subscription_activated": false,
    "workspace_entered": false
  },
  "access_mode": "onboarding_only"
}
```

### POST /api/v1/onboarding/company

- Permission: authenticated verified user without a `draft` company they already own. A user who already has companies may still create another.
- Body: `{"legal_name": "Northwind Pvt Ltd", "display_name": "Northwind", "slug": "northwind", "timezone": "Asia/Kolkata"}`.
- Success `201`: company object, membership `active`, owner role assigned, onboarding row created, and a founder `people` row linked from that membership.
- Validation: slug lowercase, 3–63 characters, globally unique.
- Creates `companies.status = draft` and the owner membership. Does not activate billing.

### PATCH /api/v1/onboarding/company-profile

- Body may set `legal_name`, `display_name`, `timezone`.
- Success `200`: company. Sets `profile_completed_at`.

### PUT /api/v1/onboarding/billing-profile

- Body: billing name, email, address lines, city, `state_code`, postal code, country code, optional `gstin`, optional `place_of_supply_state_code`.
- Success `200`: billing profile. Sets `billing_profile_completed_at`.
- GSTIN, when present, must match the format check. The API does not claim the GSTIN is registered.

### POST /api/v1/onboarding/plan

- Body: `{"plan_code": "growth", "billing_interval": "year"}`.
- Success `200`: selected plan price id, interval, currency, catalog `amount_minor`.
- Creates or updates the current subscription in `incomplete` or, when `trial_days > 0` and no payment is required yet, `trialing`. Trial activation is a Pulse state change and does not mark a paid invoice paid. A paid interval still needs checkout before `active`.
- Sets `plan_selected_at`. When the result is `trialing`, also sets `subscription_activated_at` and moves the company from `draft` to `active`.

### POST /api/v1/onboarding/checkout

- Header: `Idempotency-Key`.
- Body: `{"subscription_id": "uuid"}`.
- Success `201`:

```json
{
  "checkout_id": "uuid",
  "provider": "razorpay",
  "status": "pending",
  "checkout_payload": {"key_id": "rzp_test_public", "subscription_id": "provider-ref"}
}
```

`checkout_payload` contains only what the browser needs to open the provider. It is not proof of payment. The subscription stays `incomplete` until the webhook processor runs. Sets `checkout_started_at`.

### GET /api/v1/onboarding/checkout/{checkout_id}

`checkout_id` is the `payment_transactions.id` created for this checkout.

- Success `200`: transaction status and, when the webhook has processed, subscription status. The browser uses this to render a result. The GET does not change subscription status.

### POST /api/v1/onboarding/workspace-entry

- Allowed when access mode is `full` or `grace`.
- Success `200`: `{"workspace_path": "/app/northwind"}`. Sets `workspace_entered_at`.

## 5. Companies and memberships

### GET /api/v1/companies

- Auth: yes. Tenant: none. Returns memberships for the current user. No pagination beyond a reasonable cap of 100 companies.

### GET /api/v1/companies/{company_id}

- Tenant: membership. Permission: `company.view`.
- Success `200`: id, slug, names, lifecycle `status`, timezone, country. Omits other companies' data.

### PATCH /api/v1/companies/{company_id}

- Permission: `company.update`. Access mode `full` or `grace`.
- Writable: `display_name`, `timezone`. `status` is not writable here.

### GET /api/v1/companies/{company_id}/workspace

Derived `WorkspaceBootstrap`. Permission: `company.view`. Allowed in every access mode so the shell can explain a block.

```json
{
  "company": {"id": "uuid", "slug": "northwind", "display_name": "Northwind", "status": "active"},
  "access_mode": "full",
  "subscription": {"status": "trialing", "billing_interval": "year", "currency": "INR", "current_period_end": "2027-10-17T00:00:00Z"},
  "permissions": ["company.view", "people.view"],
  "installed_modules": [{"slug": "hrms", "version": "1.0.0"}],
  "entitlements": {"max_people": 50, "dashboards_enabled": true}
}
```

### GET /api/v1/companies/{company_id}/memberships

- Permission: `membership.view`. Filters: `status`. Sort: `created_at`.
- Each result includes user email, membership status, optional person id, and role ids. It does not include password hashes or platform grants.

### PATCH /api/v1/companies/{company_id}/memberships/{membership_id}

- Permission: `membership.update`.
- Body: `{"status": "suspended"}` or `{"person_id": "uuid"}`.
- `person_id` must belong to the same company. Suspending the last owner returns `409`.

### POST /api/v1/companies/{company_id}/memberships/{membership_id}/removal

- Permission: `membership.remove`. Success `200` with status `removed`.
- Last owner returns `409`.

### GET /api/v1/companies/{company_id}/invitations

- Permission: `membership.invite` or `membership.view`. Filter: `status`.

### POST /api/v1/companies/{company_id}/invitations

- Permission: `membership.invite`. Access mode `full`.
- Body: `{"email": "hr@example.com", "person_id": null, "role_ids": ["uuid"]}`.
- Success `201`: invitation id, email, status `pending`, `expires_at`. The raw token is emailed and is not returned.
- Validation: one pending invite per company and email. Roles must belong to the company. Seat entitlement `max_people` counts active people and pending invites that would create a person.
- Idempotency: optional `Idempotency-Key`.

### POST /api/v1/companies/{company_id}/invitations/{invitation_id}/revoke

- Permission: `membership.invite`. Success `200` status `revoked`.

### POST /api/v1/invitations/accept

- Auth: yes. Tenant: resolved from the token, then membership is created for that company only.
- Body: `{"token": "raw-token"}`.
- Success `200`: `{"company_id": "uuid", "membership_id": "uuid"}`.
- Expired, revoked, or unknown token: `400`. Email on the invitation must match the session user's verified email.

## 6. Organization

### Departments

| Method | URL | Permission | Success |
| --- | --- | --- | --- |
| GET | `/api/v1/companies/{company_id}/departments` | `departments.view` | 200 list |
| POST | `/api/v1/companies/{company_id}/departments` | `departments.manage` | 201 |
| PATCH | `/api/v1/companies/{company_id}/departments/{department_id}` | `departments.manage` | 200 |
| DELETE | `/api/v1/companies/{company_id}/departments/{department_id}` | `departments.manage` | 204 |

- Tenant: membership. Access mode `full` for writes, `full` or `grace` for reads.
- Body: `{"name": "People", "parent_department_id": null}`.
- Validation: unique name per company. Parent must be in the same company and must not create a cycle.
- Sort: `name`. Delete of a non-empty department returns `409`.

### People

| Method | URL | Permission | Success |
| --- | --- | --- | --- |
| GET | `/api/v1/companies/{company_id}/people` | `people.view` | 200 list |
| POST | `/api/v1/companies/{company_id}/people` | `people.create` | 201 |
| GET | `/api/v1/companies/{company_id}/people/{person_id}` | `people.view` | 200 |
| PATCH | `/api/v1/companies/{company_id}/people/{person_id}` | `people.update` | 200 |
| POST | `/api/v1/companies/{company_id}/people/{person_id}/deactivation` | `people.deactivate` | 200 |

- Filters: `status`, `department_id`, `q` on name and employee code. Sort: `last_name`, `created_at`.
- Create body includes `first_name`, `last_name`, optional `work_email`, `employee_code`, `department_id`, `manager_person_id`, `job_title`, `employment_type`, `start_date`.
- Department and manager must be in the same company. `employee_code` unique per company. Creating a person past `max_people` returns `422` `entitlement_required`.
- Department managers with `people.update` may update people in their own department only. A wider `people.update` without that role constraint applies to the company. The object check is server-side.
- Deactivation sets `status` to `inactive` and does not delete the row.

## 7. Roles and permissions

### GET /api/v1/permissions

- Auth: yes. Returns permissions with `scope = company` only. Platform codes are absent.

### GET /api/v1/companies/{company_id}/roles

- Permission: `roles.view`.

### POST /api/v1/companies/{company_id}/roles

- Permission: `roles.manage`.
- Body: `{"name": "Finance reviewer", "description": "Read billing", "permission_codes": ["billing.view"]}`.
- Success `201`. Every code must exist and have company scope. `platform.*` returns `400`.

### PATCH /api/v1/companies/{company_id}/roles/{role_id}

- Permission: `roles.manage`. Can rename a custom role. Cannot clear `is_owner_role` or drop the owner permission floor (`company.update`, `roles.manage`, `billing.manage`, `membership.invite`).

### PUT /api/v1/companies/{company_id}/roles/{role_id}/permissions

- Permission: `roles.manage`.
- Body: `{"permission_codes": ["people.view", "people.create"]}`.
- Replaces the company's role permissions in one transaction.

### PUT /api/v1/companies/{company_id}/memberships/{membership_id}/roles

- Permission: `roles.manage`.
- Body: `{"role_ids": ["uuid"]}`.
- Roles must be in the company. Removing the last owner role returns `409`.

## 8. Modules

### GET /api/v1/companies/{company_id}/modules

- Permission: `modules.view`.
- Each public module plus this company's installation status, eligibility (`included`, `add_on_required`, `not_in_plan`), and prices for the subscription's interval only.

### GET /api/v1/companies/{company_id}/module-installations

- Permission: `modules.view`. Lists `company_module_installations` for the company, including `failed` and `uninstalled`.

### POST /api/v1/companies/{company_id}/module-installations

- Permission: `modules.install`. Header: `Idempotency-Key`. Access mode `full`.
- Body: `{"module_slug": "hrms", "config": {}}`.
- Success `202`: installation row in `installing` or `installed`.
- Validation: module exists and is public; dependencies are `installed`; config matches `config_schema`; subscription entitlement includes the slug or an active module subscription item exists for that slug and the current interval; a concurrent install of the same module returns `409`.
- The call does not write `membership_role_assignments`.

### POST /api/v1/companies/{company_id}/module-installations/{installation_id}/retry

- Permission: `modules.install`. Only from `failed`. Success `202`.

### POST /api/v1/companies/{company_id}/module-installations/{installation_id}/upgrade

- Permission: `modules.install`. Body: `{"version": "1.1.0"}`. The version must be the manifest version deployed with this release. Success `202`.

### POST /api/v1/companies/{company_id}/module-installations/{installation_id}/uninstall

- Permission: `modules.uninstall`.
- Success `200` with status `uninstalled`. Business rows such as leave requests remain. Module APIs then return `422` `entitlement_required` or `404` as specified on those routes.

### PATCH /api/v1/companies/{company_id}/module-installations/{installation_id}

- Permission: `modules.configure`. Body: `{"config": {}}` validated by the module schema. Status must be `installed`.

## 9. Billing

Company billing routes use tenant membership. Reads require `billing.view` and are allowed in `billing_only`, `grace`, and `full`. Writes require `billing.manage` and the same modes. `blocked` returns `403` `access_restricted` except where platform suspension still allows the operator, not the company, to act.

### GET /api/v1/companies/{company_id}/billing/profile

Returns `company_billing_profiles`.

### PUT /api/v1/companies/{company_id}/billing/profile

Same body as onboarding billing profile. Does not rewrite issued invoices.

### GET /api/v1/companies/{company_id}/subscription

Returns the current non-canceled subscription, its items, interval, currency, snapshotted amounts, and derived `access_mode`. `404` if none exists.

### POST /api/v1/companies/{company_id}/subscription/plan-changes

- Header: `Idempotency-Key`.
- Body: `{"plan_code": "growth", "billing_interval": "year", "timing": "period_end"}`.
- `timing` is `now` or `period_end`.
- Interval changes are allowed only at `period_end` in the MVP, so monthly and annual items never mix inside one period.
- Upgrade `now` creates a proration invoice in `issued` or `draft` according to the billing rules, and a pending payment. Higher entitlements apply only after a captured payment webhook when the change increases the amount due now.
- Downgrade uses `period_end` and sets the plan item to `cancel_scheduled` with a replacement item whose `effective_at` is the period end.
- Success `202` with the subscription and any new invoice id. This response does not mean the upgrade is paid.

### POST /api/v1/companies/{company_id}/subscription/cancellation

- Body: `{"timing": "period_end"}`. `now` is accepted and moves the subscription to `canceled` without creating a refund.
- Success `200`. Access follows the access-mode matrix. Refunds are a separate platform action.

### POST /api/v1/companies/{company_id}/subscription/items

Add a module add-on.

- Header: `Idempotency-Key`. Permission: `billing.manage` and `modules.install`.
- Body: `{"module_slug": "hrms"}`.
- The price is the active `billing_module_prices` row for the subscription currency and interval. A missing interval match returns `422`.
- Success `202`: subscription item `pending`, plus an invoice for the prorated remainder when the subscription is already `active`. The item becomes `active` only in the webhook processor after capture. Trial subscriptions that include the slug in `included_module_slugs` do not need this call.

### POST /api/v1/companies/{company_id}/subscription/items/{item_id}/removal

- Body: `{"timing": "period_end"}`.
- Success `200`. `timing = period_end` sets the item to `cancel_scheduled` and keeps entitlement until the period ends. `timing = now` sets the item to `canceled` and drops entitlement immediately. Neither timing creates a cash refund.

### GET /api/v1/companies/{company_id}/invoices

- Filters: `status`. Sort: `issued_at`. Returns snapshot totals, currency, number, period, and status.

### GET /api/v1/companies/{company_id}/invoices/{invoice_id}

- Includes lines and tax components exactly as stored. Catalog price changes are not applied.

### GET /api/v1/companies/{company_id}/payments

- Permission: `billing.view`. Lists `payment_transactions` for the company.

### GET /api/v1/companies/{company_id}/refunds

- Permission: `billing.view`. Companies can see refunds. They cannot create them.

### POST /api/v1/webhooks/payments/razorpay

- Auth: webhook signature. Tenant: resolved from provider references inside the verified payload.
- Body: the provider's raw JSON. The server verifies the signature before parsing business effects.
- Success `200`: `{"status": "processed"}` or `{"status": "ignored"}` for duplicates and out-of-order events.
- Invalid signature: `400`. No subscription or invoice mutation.
- The handler inserts `payment_provider_events` on the unique `(provider, provider_event_id)` key, then updates payments, invoices, subscription items, and subscription status in one database transaction.
- A browser return URL is not this endpoint and has no mutation route.

## 10. Dashboards

Permission `dashboards.view` for reads and `dashboards.manage` for studio writes, plus access mode `full` for writes and `full` or `grace` for reads. Entitlement `dashboards_enabled` must be true or the route returns `422`.

| Method | URL | Purpose | Success |
| --- | --- | --- | --- |
| GET | `/api/v1/companies/{company_id}/widgets` | Active widget catalog the company may place | 200 |
| GET | `/api/v1/companies/{company_id}/dashboards` | List dashboards | 200 |
| POST | `/api/v1/companies/{company_id}/dashboards` | Create a draft | 201 |
| GET | `/api/v1/companies/{company_id}/dashboards/{dashboard_id}` | Dashboard plus draft or published version | 200 |
| PATCH | `/api/v1/companies/{company_id}/dashboards/{dashboard_id}` | Rename or archive | 200 |
| POST | `/api/v1/companies/{company_id}/dashboards/{dashboard_id}/versions` | Save a draft version | 201 |
| POST | `/api/v1/companies/{company_id}/dashboards/{dashboard_id}/publish` | Publish one version | 200 |
| POST | `/api/v1/companies/{company_id}/dashboards/{dashboard_id}/restore` | Copy an old version into a new draft and publish it | 200 |
| PUT | `/api/v1/companies/{company_id}/dashboards/{dashboard_id}/assignments` | Replace role and membership assignments | 200 |
| GET | `/api/v1/companies/{company_id}/dashboards/me` | Resolved dashboard for this membership | 200 |
| GET | `/api/v1/companies/{company_id}/widget-data/{widget_code}` | Data for one widget | 200 |

Version body:

```json
{
  "change_note": "HR home",
  "layout": {"columns": 12},
  "widgets": [
    {
      "widget_code": "people.count",
      "grid_x": 0,
      "grid_y": 0,
      "grid_w": 3,
      "grid_h": 2,
      "config": {}
    }
  ]
}
```

Validation: widget code exists and is active; if `module_slug` is set, that module is installed; config matches `config_schema`; grid bounds fit the column count. Publish sets that version to `published`, the previous published version to `superseded`, and `dashboards.published_version_id`.

`GET .../dashboards/me` picks the highest-priority assignment matching the membership or one of its roles, then returns the published version. Widgets the user cannot access are omitted. Omission is presentation. The data route still checks.

`GET .../widget-data/{widget_code}` requires the widget's `required_permission`, tenant membership, module installation when the widget declares a module, and entitlement. Query parameters are widget-specific and validated. A dashboard assignment is not an input and cannot widen access.

Assignment body: `{"assignments": [{"company_role_id": "uuid", "priority": 10}, {"membership_id": "uuid", "priority": 20}]}`. Each entry has exactly one target, and both ids must belong to the company.

## 11. Notifications and audit

### GET /api/v1/companies/{company_id}/notifications

- Permission: `notifications.view`. Only rows whose `recipient_user_id` is the caller and whose `company_id` is this company.
- Filter: `unread=true`.

### POST /api/v1/companies/{company_id}/notifications/{notification_id}/read

- Permission: `notifications.view`. Success `200`. Caller must be the recipient.

### GET /api/v1/companies/{company_id}/audit-logs

- Permission: `audit.view`.
- Filters: `action`, `object_type`, `created_from`, `created_to`. Sort: `created_at` only, default descending.
- Results never include another company's rows.

## 12. HRMS Leave

All routes require membership, access mode `full` for writes and `full` or `grace` for reads, installation status `installed` for slug `hrms`, and entitlement. Otherwise `404` when the installation is absent or uninstalled, so the module does not advertise itself.

| Method | URL | Permission | Success |
| --- | --- | --- | --- |
| GET, POST | `/api/v1/companies/{company_id}/hrms/leave-policies` | `hrms.leave.decide` for POST, `hrms.leave.view` for GET | 200 / 201 |
| GET, POST | `/api/v1/companies/{company_id}/hrms/leave-requests` | `hrms.leave.view`, `hrms.leave.request` | 200 / 201 |
| POST | `/api/v1/companies/{company_id}/hrms/leave-requests/{request_id}/decision` | `hrms.leave.decide` | 200 |

Create request body: `{"person_id": "uuid", "policy_id": "uuid", "start_date": "2026-11-02", "end_date": "2026-11-03", "reason": "Family event"}`.

An employee with `hrms.leave.request` may create a request only for the person linked to their membership. A caller with `hrms.leave.decide` may decide requests in the company. Decision body: `{"status": "approved"}` with `approved` or `rejected`.

## 13. Platform administration

Tenant scope: `platform`. Company permissions are never consulted. Object ids may refer to any company, and responses are still limited to the fields in [10-platform-administration.md](10-platform-administration.md).

| Method | URL | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/platform/metrics` | `platform.companies.view` plus `platform.billing.view` for money fields | Counts, MRR, renewals |
| GET | `/api/v1/platform/companies` | `platform.companies.view` | Company list and lifecycle |
| GET | `/api/v1/platform/companies/{company_id}` | `platform.companies.view` | Company summary without employee personal records |
| POST | `/api/v1/platform/companies/{company_id}/suspension` | `platform.companies.manage` | Set `suspended` |
| POST | `/api/v1/platform/companies/{company_id}/reactivation` | `platform.companies.manage` | Clear suspension when not `closed` |
| POST | `/api/v1/platform/companies/{company_id}/closure` | `platform.companies.manage` | Set `closed` |
| GET | `/api/v1/platform/users` | `platform.users.view` | Global user counts and account status |
| GET | `/api/v1/platform/subscriptions` | `platform.billing.view` | Status, interval, period end |
| GET | `/api/v1/platform/invoices` | `platform.billing.view` | Invoice headers |
| GET | `/api/v1/platform/payments` | `platform.billing.view` | Captured and failed payments |
| GET | `/api/v1/platform/refunds` | `platform.billing.view` | Refund list |
| POST | `/api/v1/platform/refunds` | `platform.billing.manage` | Execute a refund |
| GET | `/api/v1/platform/modules` | `platform.modules.manage` | Adoption and failed installs |
| GET | `/api/v1/platform/provider-events` | `platform.operations.view` | Failed and recent webhooks |
| GET | `/api/v1/platform/tasks` | `platform.operations.view` | Failed background tasks |
| GET | `/api/v1/platform/audit-logs` | `platform.audit.view` | Platform-scoped and cross-company audit metadata |
| GET | `/api/v1/platform/usage` | `platform.companies.view` | Quota snapshots |

`GET /api/v1/platform/metrics` money section is omitted unless the caller also has `platform.billing.view`, so a company-operations grant does not reveal revenue.

Refund create body:

```json
{
  "payment_transaction_id": "uuid",
  "amount_minor": 10000,
  "currency": "INR",
  "reason": "Duplicate charge"
}
```

Header: `Idempotency-Key`. Success `202` with refund status `pending`. The provider adapter performs the refund. Webhook or reconciliation moves it to `succeeded` or `failed`. The invoice total is not rewritten.

Company list filters: `status`, `created_from`, `created_to`. Subscription list filters: `status`, `billing_interval`. Payment list filters: `status`.

There is no impersonation endpoint.

## 14. End-to-end journey

1. `POST /auth/register` creates `users`.
2. `POST /auth/email-verifications/confirm` sets `email_verified_at`.
3. `POST /auth/login` opens a session.
4. `POST /onboarding/company` creates `companies` (`draft`), `company_memberships` (`active`), the owner `company_roles` clone, `onboarding_states`, and the founder `people` row linked to that membership.
5. `PUT /onboarding/billing-profile` writes `company_billing_profiles`.
6. `POST /onboarding/plan` with `billing_interval` `month` or `year` writes `subscriptions` and one plan `subscription_items` row. A plan with `trial_days` moves status to `trialing` and company status to `active` without a captured payment.
7. Before trial end, `POST /onboarding/checkout` creates a `pending` payment and a provider checkout. The redirect back only calls `GET /onboarding/checkout/{id}`.
8. `POST /webhooks/payments/razorpay` after signature verification sets the payment to `captured`, the invoice to `paid`, and the subscription to `active`.
9. `POST /companies/{id}/people` creates a person. `POST /invitations` and `POST /invitations/accept` create another membership.
10. `PUT /memberships/{id}/roles` assigns HR Manager.
11. `POST /module-installations` with `hrms` checks `modules.install`, entitlement or an active module item, and dependencies, then sets the installation to `installed` without granting permissions.
12. `POST /dashboards` and `POST /publish` store a published version assigned to HR Manager.
13. The HR user calls `GET /dashboards/me` and `GET /widget-data/people.count`. The widget route checks `people.view` itself.
14. The operator calls `GET /platform/metrics` with platform grants and reads MRR from active subscription items, not from the SPA.

That journey uses only MVP tables. CRM and Commerce are not required.
