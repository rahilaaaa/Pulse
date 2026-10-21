# Week 1 model differences

These differences from `docs/architecture/schema.dbml` are intentional for this phase.

- `users.password_hash` and `users.last_login_at` are the database columns. Django's auth API still uses the `password` and `last_login` field names.
- Email verification tokens, password reset tokens, public registration, onboarding, billing profiles, invitations, company settings, people, company roles, modules, billing, dashboards, notifications, audit logs, and RLS policies are not migrated yet.
- `company_memberships.person_id` is omitted until the `people` table exists. The composite foreign key and partial unique index that depend on it are deferred with it.
- `permissions.module_slug` is stored without a foreign key until `module_definitions` exists. Only platform-scoped permission rows are seeded.
- The companies list returns `membership_count` for memberships in `active` status. People counts and installed module slugs are omitted because those tables are not part of this phase.
- Platform access is only `platform_permission_grants`. There is no platform flag on `users`.
- Platform operators must complete authenticator-app MFA before a session is created. `users.mfa_secret` stores the encrypted TOTP secret, and `users.mfa_enabled_at` records enrollment. These columns are not in the approved DBML.
- Creating a company writes the company, an active owner membership, an onboarding checklist, and an audit row. It does not create a `people` row or an owner role yet, because those tables are still deferred.
- `company_billing_profiles` stores the onboarding billing identity. GSTIN is optional and is format-checked.
- Plan selection writes `billing_plans`, prices, entitlements, one open `subscriptions` row, a plan `subscription_items` snapshot, and a status event. A plan with `trial_days` becomes `trialing` and moves the company from `draft` to `active`. The provider code is `pulse` until checkout exists. Invoices, payments, and Razorpay are not created.
- `audit_logs` rejects UPDATE and DELETE with a database trigger. Production should also grant the application role only INSERT and SELECT.
