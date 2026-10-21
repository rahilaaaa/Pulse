# 10 — Platform Administration

Status: approved planning baseline. `/platform` is the operator console. It is not a company workspace and it is not reached by assigning a company role.

## 1. Authorization boundary

Every route under `/api/v1/platform/` requires a row in `platform_permission_grants`. The permission catalog and the refusal of company roles to carry those codes are in [05-identity-and-authorization.md](05-identity-and-authorization.md).

An owner of every customer company, with every company permission, still receives `403` on platform routes.

The MVP does not include impersonation, a support login into a tenant, or a screen that dumps a company's people records for casual browsing. Company detail in this console is an operational summary.

## 2. Screens and the permission that gates them

| Screen | Permission | Data |
| --- | --- | --- |
| Company counts and lifecycle | `platform.companies.view` | Counts of `companies` by `status`, plus a filterable list of id, name, slug, status, created date, people count, membership count, installed module slugs. |
| Company summary | `platform.companies.view` | The same summary for one company, onboarding timestamps, and subscription status. No person names, no leave reasons, no message bodies. |
| Suspend, reactivate, close | `platform.companies.manage` | Writes `companies.status` and an audit row. |
| Global users | `platform.users.view` | Count of `users`, active versus inactive, count of `company_memberships`, count of `people`. These three counts are separate. |
| Subscriptions and renewals | `platform.billing.view` | Status, `billing_interval`, currency, period end, cancel-at-period-end flag. |
| Revenue | `platform.billing.view` | MRR, MRR at risk, rounding residual, collected payments, refunds. Rules are section 3. |
| Invoices and refunds | `platform.billing.view` | Headers, totals, statuses. Refund execution is `platform.billing.manage`. |
| Module adoption | `platform.modules.manage` | Install counts by slug and status, failed installations with `last_error`, version on each installation. |
| Webhooks and jobs | `platform.operations.view` | `payment_provider_events` in `failed`, `background_tasks` in `failed`. |
| Usage and quotas | `platform.companies.view` | `usage_records` beside the plan entitlement for `max_people` and `max_installed_modules`. |
| Audit | `platform.audit.view` | `audit_logs`, including rows with a null company id. |
| Health | `platform.operations.view` | Process can read the database, failed job count, failed webhook count, oldest unprocessed event. Not a metrics vendor product. |

Money fields on `GET /api/v1/platform/metrics` are included only when the caller has `platform.billing.view`. A companies-only operator does not receive MRR.

## 3. Revenue metrics

All figures are queries over billing tables. They are not taken from the browser and not inferred from subscription status alone. A subscription in `active` with no active items contributes zero.

Amounts are integer paise, currency `INR` in the MVP. The API returns `currency` beside every total so a later currency can be reported as separate totals instead of a blended number.

### 3.1 Committed MRR

Include a subscription item only when:

- `subscription_items.status = active`, and
- the parent `subscriptions.status = active`.

Exclude `trialing`, `incomplete`, `past_due`, `unpaid`, and `canceled` subscriptions from committed MRR. Include items in `active` and `cancel_scheduled`. Exclude `pending` and `canceled` items. A `cancel_scheduled` item is still the billed item until period end, so it stays in committed MRR. Its replacement stays `pending` until that moment and is not included, which avoids counting both prices. A subscription with `cancel_at_period_end = true` and status `active` stays in committed MRR until the status actually becomes `canceled`.

For each included item:

- Interval `month`: contribution = `unit_amount_minor * quantity`.
- Interval `year`: contribution = `(unit_amount_minor * quantity) / 12`, integer division. Residual paise = `(unit_amount_minor * quantity) % 12`.

Committed MRR is the sum of contributions. `mrr_rounding_residual_minor` is the sum of residuals and is reported beside MRR. Residuals are not forced into the MRR integer, so the figure stays reconcilable.

ARR for display is committed MRR times 12. Because of residuals, ARR is not always equal to the sum of annual item amounts. The residual field is how an operator explains the difference.

### 3.2 What MRR excludes

- Taxes (`invoices.tax_minor` and `invoice_tax_components`). MRR is pre-tax.
- One-time invoice lines: `proration_charge`, `proration_credit`, and `adjustment`.
- Invoice `discount_minor`. The MVP has no recurring coupon stored on the subscription item. If a recurring discount is added later, it must be snapshotted onto the item before it affects MRR.
- Refunds. Succeeded refunds in a period are `refunds_succeeded_minor`. They are not subtracted inside committed MRR.
- Failed payments. Failure does not change MRR until the subscription status leaves `active`.

### 3.3 MRR at risk

The same item formula, restricted to parent subscriptions in `past_due`. This is a separate number. It is not added to committed MRR.

### 3.4 Collected cash

`collected_minor` for a period is the sum of `payment_transactions.amount_minor` where status is `captured` and `captured_at` falls in the period. This is cash collection, not MRR. Refunds are not netted inside this number; they stay on the refund metric.

### 3.5 Cancellations, failures, and taxes

| Event | Effect on committed MRR |
| --- | --- |
| Trial starts | None. Trials are excluded. |
| First payment captured and status becomes `active` | Item snapshots enter MRR. |
| Renewal fails and status becomes `past_due` | Amount leaves committed MRR and appears in MRR at risk. |
| Grace ends and status becomes `unpaid` | Amount leaves both committed MRR and MRR at risk. |
| Cancel at period end while still `active` | Stays in committed MRR. |
| Status becomes `canceled` | Leaves committed MRR. |
| Refund succeeds | No MRR change. Refund total changes. |
| Tax assessed on an invoice | No MRR change. |

Monthly and annual subscriptions use the same formula. Annual amounts are normalized only inside this metric. Invoices and renewals still charge the full annual snapshot.

## 4. Company and usage metrics

These are counts, not revenue:

- Registered companies, and the same count split by `draft`, `active`, `suspended`, and `closed`.
- New companies in a date range from `companies.created_at`.
- Users from `users`, split by `is_active`.
- Memberships from `company_memberships`, split by status.
- People from `people`, split by status.
- Installed modules from installations where status is `installed`.
- Usage from `usage_records` for `people_active` and `modules_installed`, compared with the entitlements of the current plan.

Employee count is the people count. It is not the user count and not the membership count.

## 5. Billing operations the operator can see

- Subscriptions grouped by status and by `billing_interval`.
- Upcoming renewals: `active` or `trialing` rows with `current_period_end` inside the selected window.
- Payments filtered by `captured` and `failed`.
- Invoices filtered by status, including issued and unpaid.
- Refunds and their statuses.
- Provider events that failed signature handling or processing, so a missed webhook is visible without opening the provider dashboard as the only record.

Suspending a company sets access mode `blocked` and does not delete invoices. Closing a company sets `closed` and does not delete billing history.

## 6. Audit and health

Platform actions write `audit_logs` with a null `company_id` for grant changes and with the target `company_id` for suspension, closure, and refunds. The actor is the operator user. The request id is stored.

Health for the MVP is the operations endpoint: database connectivity, count of failed tasks, count of failed provider events, and the age of the oldest failed event. There is no Kubernetes probe design and no third-party APM requirement in this plan.

## 7. Customer data minimization

Platform list endpoints return operational and financial fields. They do not return password hashes, token hashes, payment secrets, leave reasons, or dashboard layouts. A future support tool that needs those fields requires its own permission and its own audit design. It is not implied by `platform.companies.view`.
