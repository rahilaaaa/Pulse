# 03 — Database Design

Status: approved planning baseline. Column names, types, keys, and tenant composite foreign keys are canonical in [schema.dbml](schema.dbml). This document explains purpose, constraints, ownership, retention, and the decisions behind that file.

## 1. Conventions

- PostgreSQL 16. Shared database and shared schema. Tenant ownership is a `company_id` column plus tenant-aware services.
- Primary keys are UUIDs. Sequential integers are not used for object ids.
- Status and type columns are `varchar` with check constraints. Native PostgreSQL enums are avoided so new values can ship in an ordinary migration.
- Money is `bigint` minor units. For INR, one unit is one paise. `numeric` and floating-point money are forbidden. `hrms_leave_policies.annual_allowance_days` is `numeric` because it counts days, not money.
- Currency is `char(3)` on every catalog price, subscription, subscription item, invoice, payment, and refund. The MVP check constraint allows only `INR`. Adding a currency later adds rows and relaxes that check. It does not replace the billing tables.
- Timestamps are `timestamptz`.
- Tenant-owned parents expose `unique (company_id, id)`. Children that point at those parents use a composite foreign key `(company_id, parent_id)`. A person, role, invoice line, or leave request cannot reference another company's parent.
- Nullable composite foreign keys use PostgreSQL `MATCH SIMPLE`: the constraint applies when every referenced column is present.
- Partial unique indexes are called out in prose where DBML cannot express the predicate.
- Django's `django_session` table is created by the framework and is not duplicated in `schema.dbml`.

### 1.1 Core versus optional

Core platform tables are every table in `schema.dbml` except `hrms_leave_policies` and `hrms_leave_requests`. Those two belong to the HRMS Leave module. Their migrations live in the `hrms` Django app and deploy with the monolith. Rows exist only after that company installs the module and uses it.

CRM and Commerce tables are postponed. They are not in `schema.dbml`.

### 1.2 Separate lifecycles

These values are not interchangeable:

| Concern | Stored on | Allowed values |
| --- | --- | --- |
| Company lifecycle | `companies.status` | `draft`, `active`, `suspended`, `closed` |
| Subscription | `subscriptions.status` | `incomplete`, `trialing`, `active`, `past_due`, `canceled`, `unpaid` |
| Subscription item | `subscription_items.status` | `pending`, `active`, `cancel_scheduled`, `canceled` |
| Invoice | `invoices.status` | `draft`, `issued`, `paid`, `void`, `uncollectible` |
| Payment | `payment_transactions.status` | `pending`, `authorized`, `captured`, `failed`, `refunded`, `partially_refunded` |
| Refund | `refunds.status` | `pending`, `succeeded`, `failed` |
| Workspace access | not stored | `full`, `grace`, `billing_only`, `onboarding_only`, `blocked` |

Access mode is derived by the policy in [08-subscriptions-and-billing.md](08-subscriptions-and-billing.md). It is not a column, so it cannot drift from the records above.

## 2. Identity

### users

Global login account. One row per person who can authenticate, regardless of how many companies they belong to.

- Primary key: `id`.
- Unique: `email` (stored lowercase).
- Checks: none beyond not-null flags. `is_active` defaults true.
- Indexes: unique email.
- Tenant: none.
- Fields: `id uuid`, `email varchar(254)`, `password_hash varchar(255)`, `first_name varchar(150)`, `last_name varchar(150)`, `is_active boolean`, `email_verified_at timestamptz`, `last_login_at timestamptz`, `created_at timestamptz`, `updated_at timestamptz`.
- Deletion: deactivate with `is_active = false`. Hard delete waits for the retention runbook. Do not delete while memberships, audit rows, or billing actor references exist.

### email_verification_tokens

Single-use proof that the user controls the email address.

- Primary key: `id`. Foreign key: `user_id` → `users.id`.
- Unique: `token_hash`. Index: `user_id`.
- Tenant: none. The raw token is never stored.
- Fields: `id`, `user_id`, `token_hash varchar(255)`, `expires_at`, `used_at`, `created_at`.
- Deletion: retain used and expired rows for the security-event window, then purge by age. Recommended operational purge: 30 days after expiry.

### password_reset_tokens

Same shape and retention as email verification tokens. A successful reset sets `used_at` and rotates the password hash.

## 3. Tenants and onboarding

### companies

The tenant.

- Primary key: `id`. Unique: `slug`.
- Foreign key: `created_by_user_id` → `users.id`, nullable for a future operator-created company.
- Indexes: `status`, `created_at`.
- Check: `status` in `draft`, `active`, `suspended`, `closed`.
- Tenant: this row is the tenant boundary.
- Fields: `id`, `slug varchar(63)`, `legal_name varchar(255)`, `display_name varchar(255)`, `status varchar(32)`, `country_code char(2)`, `timezone varchar(64)`, `created_by_user_id`, `suspended_at`, `closed_at`, `created_at`, `updated_at`.
- Deletion: `closed` retains the row. Suspend and close are operator actions. Customer data export is a later product workflow. Recommended retention: billing records for the statutory period confirmed by counsel; operational detail retained at least through that period because invoices reference the company.

### company_billing_profiles

Current billed-to identity. Issued invoices copy these fields and do not read them again.

- Primary key: `id`. Unique and foreign key: `company_id` → `companies.id`.
- Fields: `billing_name`, `billing_email`, `phone`, `address_line1`, `address_line2`, `city`, `state_code varchar(8)`, `postal_code`, `country_code`, `gstin varchar(15)`, `place_of_supply_state_code`, timestamps.
- Check: when `gstin` is present it matches the 15-character GSTIN pattern. Applicability of GSTIN is an unresolved legal item.
- Tenant: one profile per company.
- Deletion: retained with the company. Changes do not rewrite `invoices`.

### company_memberships

The user's access to one company. Distinct from `users` and from `people`.

- Primary key: `id`.
- Foreign keys: `company_id` → `companies`; `user_id` → `users`; composite `(company_id, person_id)` → `people (company_id, id)`.
- Unique: `(company_id, id)`, `(company_id, user_id)`, partial unique `(company_id, person_id)` where `person_id` is not null.
- Indexes: `user_id`, `(company_id, status)`.
- Check: `status` in `invited`, `active`, `suspended`, `removed`.
- Tenant: owned by `company_id`.
- Deletion: set `removed`. Keep the row so audit and historical assignments remain explainable.

### membership_invitations

Email invitation to join a company, optionally pre-linked to a person in that company.

- Primary key: `id`.
- Foreign keys: `company_id`; `invited_by_user_id`; `accepted_by_user_id`; composite `(company_id, person_id)` → `people`.
- Unique: `token_hash`, `(company_id, id)`. Partial unique: one `pending` row per `(company_id, email)`.
- Check: `status` in `pending`, `accepted`, `revoked`, `expired`.
- Tenant: `company_id`.
- Deletion: terminal statuses are retained for audit, then purged after the security-event window (recommended 1 year).

### onboarding_states

Resume checklist for the founding user. One row per company. Missing timestamps are the incomplete steps. There is no single status column to corrupt.

- Primary key: `id`. Unique `company_id`. Foreign keys: `company_id`, `owner_user_id`.
- Timestamps: `email_verified_at`, `company_created_at`, `profile_completed_at`, `billing_profile_completed_at`, `plan_selected_at`, `checkout_started_at`, `subscription_activated_at`, `workspace_entered_at`.
- Tenant: `company_id`.
- Deletion: retained with the company.

### company_settings

Small JSON settings that do not deserve columns yet.

- Primary key: `id`. Unique `(company_id, key)`. Foreign key: `company_id`.
- Fields: `key varchar(100)`, `value jsonb`, `updated_at`.
- Tenant: `company_id`.
- Deletion: deleted with an explicit company-erasure procedure later. Not used for secrets.

## 4. Organization and people

### departments

- Primary key: `id`. Unique `(company_id, id)` and `(company_id, name)`.
- Foreign keys: `company_id`; composite `(company_id, parent_department_id)` → `departments (company_id, id)`.
- Tenant: `company_id`.
- Fields: `name varchar(150)`, `parent_department_id`, timestamps.
- Deletion: block delete while people or child departments still reference it. Empty departments may be deleted.

### people

Employee or directory record. May exist with no login.

- Primary key: `id`. Unique `(company_id, id)`. Partial unique `(company_id, employee_code)` where `employee_code` is not null.
- Foreign keys: `company_id`; composite department; composite manager person in the same company.
- Indexes: `(company_id, status)`, `(company_id, department_id)`.
- Checks: `status` in `active`, `inactive`. `employment_type`, when set, in `full_time`, `part_time`, `contractor`, `intern`. `end_date` is null or on/after `start_date`.
- Fields: names, `work_email`, `job_title`, employment fields, dates, timestamps.
- Tenant: `company_id`.
- Deletion: set `inactive`. Do not hard-delete people referenced by memberships, leave requests, or audit history.

## 5. Authorization

### permissions

Global catalog seeded from code.

- Primary key: `code varchar(100)`.
- Fields: `description text`, `scope varchar(32)`, `module_slug varchar(64)` nullable.
- Foreign key: `module_slug` → `module_definitions.slug` when the permission belongs to a module. Core permissions leave it null.
- Check: `scope` in `company`, `platform`.
- Tenant: global.
- Deletion: permissions are retired in code and left in the catalog so old audit text still resolves. They are not granted to new roles.

### role_templates

Global starter roles: `owner`, `administrator`, `hr_manager`, `department_manager`, `employee`.

- Primary key: `id`. Unique: `code`.
- Fields: `name`, `description`, `is_system`.
- Tenant: global.
- Deletion: system templates are not deleted.

### role_template_permissions

- Primary key: `(role_template_id, permission_code)`.
- Foreign keys to `role_templates` and `permissions`.
- Only `scope = company` permissions appear here.

### company_roles

Per-company roles cloned from templates at company creation, plus later custom roles.

- Primary key: `id`. Unique `(company_id, id)` and `(company_id, name)`.
- Foreign key: `company_id`.
- Fields: `template_code`, `name`, `description`, `is_owner_role`, `is_system`, timestamps.
- Tenant: `company_id`.
- Deletion: custom roles with no assignments may be deleted. The owner role and any role that still has assignments cannot. The owner role's permission floor is enforced in the service, not by deleting rows.

### company_role_permissions

- Primary key: `(company_role_id, permission_code)`.
- Composite foreign key `(company_id, company_role_id)` → `company_roles (company_id, id)`.
- Foreign key: `permission_code` → `permissions.code`.
- Service rule: the permission's `scope` must be `company`. A company administrator cannot insert `platform.*`.
- Tenant: `company_id`.

### membership_role_assignments

A membership may hold more than one role. Authorization unions the permission codes. It does not trust role names, except for the last-owner invariant on `is_owner_role`.

- Primary key: `id`. Unique `(membership_id, company_role_id)`.
- Composite foreign keys to `company_memberships` and `company_roles` on `(company_id, id)`.
- Foreign key: `assigned_by_user_id` → `users`.
- Tenant: `company_id`.
- Deletion: delete the assignment row when a role is revoked. The last active membership holding the owner role cannot be unassigned.

### platform_permission_grants

Operator authorization. Independent of every company role.

- Primary key: `id`. Unique `(user_id, permission_code)`.
- Foreign keys: `user_id`, `granted_by_user_id`, `permission_code`.
- Service rule: permission `scope` must be `platform`.
- Tenant: none.
- Deletion: delete the grant row to revoke. Audit the change.

## 6. Module registry

### module_definitions

Global catalog. Seeded from trusted in-repository manifests. `is_core` is false for HRMS, CRM, and Commerce. HRMS is the only optional module with tables in the MVP.

- Primary key: `slug`.
- Fields: `display_name`, `description`, `version`, `django_app_label`, `min_platform_version`, `is_core`, `is_public`, `config_schema jsonb`, timestamps.
- Tenant: global.
- Deletion: retire with `is_public = false`. Do not delete a slug that installations reference.

### module_dependencies

- Primary key: `(module_slug, depends_on_slug)`.
- Check: the two slugs differ.
- HRMS Leave has no dependencies. It does not require CRM or Commerce.

### company_module_installations

One row per company and module, including a later `uninstalled` state. Reinstall updates this row rather than inserting a second current row.

- Primary key: `id`. Unique `(company_id, module_slug)`.
- Foreign keys: `company_id`, `module_slug`, `installed_by_user_id`.
- Check: `status` in `pending`, `installing`, `installed`, `failed`, `upgrading`, `uninstalling`, `uninstalled`.
- Fields: `installed_version`, `config jsonb`, `last_error`, install and uninstall timestamps.
- Tenant: `company_id`.
- Deletion: uninstall keeps the row and keeps module business data. See [07-modular-plugin-architecture.md](07-modular-plugin-architecture.md).

## 7. Billing catalog

Catalog prices are what a customer can buy now. Charged amounts live on subscription items and invoice lines.

### billing_plans

- Primary key: `id`. Unique: `code`.
- Fields: `name`, `description`, `is_active`, `is_public`, `trial_days integer`, timestamps.
- Check: `trial_days >= 0`. Zero means that plan has no trial.
- Tenant: global.

### billing_plan_prices

A plan has a monthly price and an annual price. Each is a full-period amount in paise, not a monthly equivalent stored as the charge.

- Primary key: `id`. Foreign key: `plan_id`.
- Unique: `(plan_id, billing_interval, currency, effective_from)`.
- Checks: `billing_interval` in `month`, `year`; `amount_minor >= 0`; MVP `currency = 'INR'`.
- Fields: `provider`, `provider_price_ref`, `is_active`, `effective_from`, `effective_to`, `created_at`.
- Closing a price sets `effective_to` and `is_active = false`. Existing subscription items keep their snapshotted `unit_amount_minor`.

### billing_plan_entitlements

- Primary key: `id`. Unique `(plan_id, entitlement_key)`.
- `entitlement_value jsonb` so a limit can be a number and an allow-list can be an array.
- Initial keys: `max_people`, `max_installed_modules`, `included_module_slugs`, `dashboards_enabled`.
- Tenant: global, applied to a company through its current subscription's plan.

### billing_module_prices

Optional recurring module price. The purchased interval must equal `subscriptions.billing_interval`. Independent module billing cycles are postponed.

- Same money, currency, interval, and effective-dating rules as plan prices.
- Foreign key: `module_slug`.
- Unique: `(module_slug, billing_interval, currency, effective_from)`.

## 8. Subscriptions, invoices, and payments

### billing_customers

Provider customer reference for one company.

- Primary key: `id`. Unique `company_id`. Unique `(company_id, id)` to support the composite payment-method foreign key. Unique `(provider, provider_customer_ref)`.
- Fields: `provider varchar(32)`, `provider_customer_ref varchar(255)`, timestamps.
- Tenant: `company_id`.

### billing_payment_methods

Display and mandate reference only.

- Primary key: `id`. Unique `(provider, provider_method_ref)`.
- Foreign keys: `company_id`; composite `(company_id, billing_customer_id)` → `billing_customers (company_id, id)`.
- Checks: `method_type` in `card`, `upi`, `emandate`, `netbanking`, `other`; `status` in `active`, `inactive`, `failed`.
- Fields: `brand`, `last4`, `is_default`, timestamps.
- Never store a card number, bank account number, or UPI secret.
- Tenant: `company_id`.
- Not every `method_type` can renew a subscription. That limitation is documented in the billing document and is not a schema assumption.

### subscriptions

The company's commercial relationship. One current row per company.

- Primary key: `id`. Unique `(company_id, id)`.
- Foreign keys: `company_id`, `plan_id`, `plan_price_id`.
- Partial unique: `(provider, provider_subscription_ref)` where the reference is not null.
- Partial unique: one row per `company_id` where `status <> 'canceled'`.
- Checks: `billing_interval` in `month`, `year`; `status` in `incomplete`, `trialing`, `active`, `past_due`, `canceled`, `unpaid`; MVP currency `INR`.
- Fields include period bounds, `trial_ends_at`, `cancel_at_period_end`, `canceled_at`, `past_due_since`, `grace_ends_at`, provider reference, timestamps.
- `plan_price_id` records which catalog row was selected. The amount actually charged is copied onto `subscription_items.unit_amount_minor` and invoice lines.
- Tenant: `company_id`.
- Deletion: cancel. Do not delete subscription rows that invoices reference.

### subscription_items

Plan fee and each optional module on the same interval.

- Primary key: `id`. Unique `(company_id, id)`.
- Composite foreign key `(company_id, subscription_id)` → `subscriptions (company_id, id)`.
- Foreign keys: `plan_price_id`, `module_price_id`, `module_slug`, each nullable according to type.
- Checks: `item_type` in `plan`, `module`; `quantity > 0`; interval equals the parent subscription; currency equals the parent subscription; plan items have only `plan_price_id`; module items have `module_price_id` and `module_slug`; at most one `pending` or `active` plan item per subscription.
- `unit_amount_minor` and `description` are snapshots. A later catalog price change does not update them.
- `status`: `pending` until payment activates the item, `active`, `cancel_scheduled` until period end, `canceled` after that.
- Tenant: `company_id`.

### subscription_status_events

Append-only history of subscription status changes.

- Primary key: `id`.
- Composite foreign key to `subscriptions`. Optional foreign keys to `payment_provider_events` and `users`.
- Fields: `from_status`, `to_status`, `reason`, `created_at`.
- No updates and no deletes in application code.

### invoice_sequences

Allocates Pulse invoice numbers.

- Primary key: `id`. Unique `(prefix, financial_year)`.
- Fields: `prefix varchar(16)`, `financial_year varchar(9)`, `last_value integer`.
- The series format, including financial year, needs accounting confirmation before production numbering. The table is ready either way.

### invoices

Pulse's own invoice header. A Razorpay receipt or invoice does not replace this row.

- Primary key: `id`. Unique `invoice_number`. Unique `(company_id, id)`.
- Foreign key: `company_id`. Composite `(company_id, subscription_id)` → `subscriptions` when a subscription is present.
- Checks: status list in section 1.2; `discount_minor >= 0`; `taxable_minor = subtotal_minor - discount_minor`; `total_minor = taxable_minor + tax_minor`; currency `INR` in the MVP.
- Snapshot fields, immutable once status leaves `draft`: `billing_name_snapshot`, `billing_address_snapshot jsonb`, `gstin_snapshot`, `place_of_supply_state_code`, `supplier_legal_name_snapshot`, `supplier_gstin_snapshot`, `supplier_state_code_snapshot`, `sac_code_snapshot`, `period_start`, `period_end`, all minor-unit totals, `currency`.
- Other fields: `issued_at`, `due_at`, `paid_at`, `provider`, `provider_invoice_ref`, timestamps.
- Indexes: `(company_id, issued_at)`, `(company_id, status)`, `subscription_id`.
- Tenant: `company_id`.
- Deletion: void by status. Do not delete issued invoices. Recommended statutory retention follows counsel; the planning default is to retain issued invoices for at least eight years.

### invoice_lines

Immutable commercial lines once the parent invoice is issued.

- Primary key: `id`. Unique `(company_id, id)`.
- Composite foreign keys to `invoices` and, when present, `subscription_items`, both including `company_id`.
- Checks: `line_type` in `plan`, `module`, `proration_charge`, `proration_credit`, `adjustment`; `quantity > 0`; `unit_amount_minor` negative only for credit and adjustment lines.
- Fields: `description`, `billing_interval`, `quantity`, `unit_amount_minor`, `amount_minor`, period bounds, `created_at`.
- These values are the prices and descriptions actually billed. They are not joined back to the live catalog for display of an issued invoice.

### invoice_tax_components

Normalized tax snapshot. The schema does not assume 18 percent, CGST plus SGST, or IGST.

- Primary key: `id`. Unique `(invoice_line_id, tax_code)`.
- Composite foreign keys to `invoice_lines` and `invoices` on `(company_id, id)`.
- Fields: `tax_code varchar(32)`, `tax_rate_bps integer`, `taxable_minor`, `tax_minor`, `created_at`.
- `tax_rate_bps` of `1800` means 18.00 percent if and when a confirmed rate is copied here. The number is a snapshot, not a global constant.
- No rows are written when the invoice is a zero-tax trial invoice. A paid tax invoice cannot be issued unless `platform_tax_rates` has an active matching configuration. That gate is a service rule.

### payment_transactions

One attempt or capture.

- Primary key: `id`. Unique `(company_id, id)`.
- Unique `(provider, idempotency_key)`. Partial unique `(provider, provider_payment_ref)` where present.
- Foreign key: `company_id`. Composite foreign keys to `invoices` and `subscriptions` when those ids are present.
- Checks: status list in section 1.2; `amount_minor > 0`; currency matches the invoice when both exist.
- Fields: provider payment and order references, failure code and message, `captured_at`, timestamps.
- Indexes: `(company_id, created_at)`, `invoice_id`.
- Tenant: `company_id`.
- Deletion: retain with the invoice.

### refunds

- Primary key: `id`.
- Unique `(provider, idempotency_key)`. Partial unique on provider refund reference.
- Composite foreign keys to `payment_transactions` and, when present, `invoices`.
- Foreign key: `created_by_user_id`.
- Checks: status in `pending`, `succeeded`, `failed`; `amount_minor > 0`; sum of succeeded refunds for a payment cannot exceed that payment's captured amount. The sum is enforced in a transaction with a row lock.
- Currency and amount are snapshotted. A refund does not rewrite the original invoice totals. A later credit-note document may reference the refund; the credit-note table itself is postponed until tax treatment is confirmed.
- Tenant: `company_id`.

### payment_provider_events

Webhook idempotency and audit.

- Primary key: `id`. Unique `(provider, provider_event_id)`.
- Fields: `event_type`, `payload jsonb`, `signature_valid boolean`, `processing_status`, `error`, `processed_at`, `created_at`.
- Check: `processing_status` in `received`, `processed`, `ignored`, `failed`.
- Invalid signatures are stored as `failed` or rejected before insert, and they never move money or subscription status. The implementation choice is in the billing document: reject invalid signatures with `400` and still write an audit security event without treating the payload as executable.
- Tenant: payload may name a company only after the adapter resolves a known provider reference. The table itself is global.
- Deletion: retain for reconciliation. Recommended minimum: 1 year, longer if counsel requires it.

## 9. Platform billing configuration

### platform_supplier_profile

Singleton legal identity of the Pulse operator, copied onto each issued invoice. GSTIN may be null until registration is confirmed. Production tax invoices stay blocked until the unresolved tax items in the billing document are answered.

### platform_tax_rates

Configurable tax components. `is_active` defaults false.

- Fields: `tax_code`, `supply_scope` (`intra_state` or `inter_state`), `rate_bps`, `sac_code`, effective dates, `is_active`.
- Unique `(tax_code, supply_scope, effective_from)`.
- No seed rate is part of this plan. An empty or inactive table means Pulse will not invent GST.

### platform_settings

Operator key-value configuration, including `grace_period_days`. Distinct from `company_settings`. Planning recommendation: 7 days, stored here so it is configurable without a code change.

## 10. Dashboards

### widget_definitions

Trusted catalog. `required_permission` names the permission the data API checks. Placing the widget on a dashboard does not grant that permission.

- Primary key: `code`. Nullable `module_slug`. Foreign keys to `module_definitions` and `permissions`.
- `config_schema jsonb` is the validation contract for instance config.

### dashboards

- Primary key: `id`. Unique `(company_id, id)` and `(company_id, name)`.
- Foreign keys: `company_id`, `created_by_user_id`, composite `(company_id, published_version_id)` → `dashboard_versions`.
- Check: `status` in `draft`, `published`, `archived`.
- Tenant: `company_id`.
- Deletion: archive. Versions remain so a published configuration can be restored.

### dashboard_versions

- Primary key: `id`. Unique `(dashboard_id, version_number)` and `(company_id, id)`.
- Composite foreign key to `dashboards`.
- Checks: `version_number > 0`; `state` in `draft`, `published`, `superseded`.
- `layout jsonb` is a validated grid, not code. `change_note` is an operator comment stored with the version.
- Tenant: `company_id`.

### dashboard_widgets

Instances on one version.

- Composite foreign key to `dashboard_versions`. Foreign key `widget_code`.
- Checks: non-negative `grid_x` and `grid_y`; positive `grid_w` and `grid_h`.
- `config jsonb` must validate against the widget's `config_schema` before save.
- Tenant: `company_id`.

### dashboard_assignments

- Composite foreign keys to `dashboards`, and to either `company_roles` or `company_memberships`.
- Check: exactly one of `company_role_id` or `membership_id` is set.
- `priority integer` breaks ties. Higher priority wins.
- Tenant: `company_id`.
- Deletion: delete an assignment to unassign. Dashboard content remains.

## 11. Operations

### notifications

- Primary key: `id`.
- Foreign keys: optional `company_id`, `recipient_user_id`, composite `(company_id, membership_id)` when both are set.
- Indexes support unread lookup by recipient.
- Tenant: company notifications carry `company_id`. A platform notice may leave it null and must still address one user.
- Deletion: retain 180 days as a planning recommendation, then purge read notifications.

### audit_logs

Append-only.

- `company_id` null means a platform action.
- Fields: actor, action, object type and id, `before jsonb`, `after jsonb`, `ip_address inet`, `request_id`, `created_at`.
- Indexes: `(company_id, created_at)`, object, actor.
- Database privileges for the application role: `INSERT` and `SELECT` only.
- Retention: planning recommendation is at least 2 years for security and billing-related actions, subject to counsel.

### usage_records

Point-in-time counters used for quotas and platform metrics.

- Unique `(company_id, metric_key, period_start)`.
- Check: `quantity >= 0`.
- Initial metrics: `people_active`, `modules_installed`.
- Tenant: `company_id`.
- The live quota check for creating a person also counts `people` rows. `usage_records` is the reporting snapshot, not a substitute for the transactional count inside the write lock.

### background_tasks

Database-backed queue. No Redis in the MVP.

- Fields: `task_name`, `payload jsonb`, `status`, `attempts`, `max_attempts`, `last_error`, `run_after`, `locked_at`, `finished_at`, optional `company_id`.
- Check: `status` in `pending`, `running`, `succeeded`, `failed`.
- Index `(status, run_after)` supports the worker claim query.
- A task that touches tenant data sets company context from `company_id` before it queries. A missing company id on a tenant task fails the task.
- Deletion: retain failed tasks for operator review. Recommended purge of succeeded tasks: 30 days.

## 12. HRMS Leave

Optional module tables. Queries require an `installed` row in `company_module_installations` for slug `hrms` plus the HRMS permission and entitlement checks.

### hrms_leave_policies

- Unique `(company_id, id)` and `(company_id, name)`.
- `annual_allowance_days numeric(6,2)`.
- Tenant: `company_id`.
- Uninstall keeps rows. APIs hide them while the module is not installed.

### hrms_leave_requests

- Composite foreign keys to `people` and `hrms_leave_policies` in the same company.
- Checks: status in `pending`, `approved`, `rejected`, `cancelled`; `end_date >= start_date`.
- Fields: dates, `reason`, `decided_by_user_id`, `decided_at`, timestamps.
- Tenant: `company_id` is implied by the composite parents and stored on the row for tenant indexes and RLS.
- Indexes: `(company_id, person_id, status)`, `(company_id, start_date)`.

`hrms_leave_requests` also stores `company_id` directly so a tenant queryset and a future RLS policy have a single column to filter. The composite foreign keys are what stop a request from pointing at another company's person or policy.

## 13. Important design decisions

1. **Shared schema, composite foreign keys.** Isolation does not rely on a tenant id that the client sends. The database rejects cross-tenant parent links even if a service forgets a filter. Row-Level Security is additional and is specified in [06-multi-tenancy-and-security.md](06-multi-tenancy-and-security.md).
2. **Three identities.** `users`, `company_memberships`, and `people` stay separate so a directory record, a login, and access to several companies do not collapse into one row.
3. **Snapshots for money and tax.** Catalog tables can change. Subscription items, invoice lines, and tax components keep the numbers that were actually used.
4. **One current subscription.** History remains as `canceled` rows. Modules are items on that subscription, billed on the same `month` or `year` interval.
5. **Access mode is derived.** Company status, subscription status, invoice status, payment status, and refund status answer different questions.
6. **VARCHAR checks instead of enums.** New module statuses and tax codes do not require an enum migration dance.
7. **Invoice sequence is Pulse-owned.** Provider document numbers, when they exist, are stored as references beside `invoice_number`.

## 14. Tables postponed on purpose

Do not add these in the MVP:

- CRM: accounts, contacts, deals, activities.
- Commerce: products, variants, warehouses, stock levels, orders, order lines.
- Credit notes as their own document table. Refunds cover cash movement until GST credit-note rules are confirmed.
- Coupon and recurring-discount tables. Invoice `discount_minor` can store a one-off snapshot later; the MVP issues discounts only if a confirmed business rule exists. MRR ignores invoice discounts.
- API keys, SSO identities, impersonation sessions.
- Quota override tables. Entitlements on the plan are enough.
- Notification preferences.
- Leave balances. The MVP stores allowance on the policy and requests against it. A balance ledger can wait until accrual rules exist.
- Per-tenant database schemas and a plugin installation DDL log. Module schema ships with the monolith.

## 15. Query patterns the indexes serve

- List a company's people, invoices, audit rows, and payments by `company_id` plus a status or time column.
- Resolve the current subscription by `company_id` and non-canceled status.
- Find renewals by `subscriptions.current_period_end`.
- Reject duplicate webhooks with `(provider, provider_event_id)`.
- Claim jobs with `(status, run_after)`.
- Compute MRR from active subscription items joined to active subscriptions, using the formula in [10-platform-administration.md](10-platform-administration.md). That figure is a query, not a stored balance that can diverge.

## 16. Backup and recovery

Take automated daily base backups of PostgreSQL and continuous WAL archiving before any production customer. Restore drills are a production readiness task, not a four-week feature. Application-level deletion does not replace a backup. The billing and audit tables are the records a restore must bring back together, so they live in one database and one transaction boundary.
