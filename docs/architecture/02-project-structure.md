# 02 — Project Structure

Status: planning baseline with Phase 0 layout notes. The repository **exists**. The tree below remains the **target** layout; several packages and frontend folders differ as built. See [14-implementation-status.md](14-implementation-status.md).

## 1. Repository layout (target)

Target layout (not every path exists):

```text
Pulse/
  README.md
  docs/architecture/
  backend/
    pyproject.toml
    config/
      settings/
        base.py
        local.py
        production.py
      urls.py
      wsgi.py
      asgi.py
    apps/
      identity/
      tenants/
      organization/
      authorization/
      billing/
      billing_razorpay/
      modules_registry/
      dashboards/
      notifications/
      audit/
      platform_admin/
      hrms/
    common/
      api/
      tenancy/
      permissions/
      money/
    manage.py
  frontend/
    package.json
    index.html
    vite.config.ts
    src/
      app/
      routes/
      features/
        public/
        auth/
        onboarding/
        workspace/
        people/
        roles/
        modules/
        billing/
        dashboards/
        platform/
      modules/
        hrms/
      shared/
        api/
        ui/
        forms/
        auth/
      types/
```

`billing_razorpay` is the only package allowed to import the Razorpay client. `billing` defines the provider interface and domain models. (**As built:** `billing_razorpay` package Missing.)

### 1.1 As-built drift (high signal)

| Target | As built |
| --- | --- |
| `apps/notifications` | Notification models and APIs under `apps/tenants` |
| `apps/billing_razorpay` | Absent |
| `frontend/.../features/people|roles|modules|billing|dashboards` | Mostly folded into `features/workspace/` plus `features/platform/` |
| `frontend/src/modules/hrms` | Leave UI under workspace routes (`LeavePage`) rather than a separate modules package |
| `common/tenancy` composite helpers | Partial / not the full ADR-002 composite FK layer |

## 2. Backend responsibilities

| Path | Owns |
| --- | --- |
| `config` | Settings, installed apps, root URL routing, middleware order. |
| `common/api` | Error body, pagination, request id, idempotency helper. |
| `common/tenancy` | Current company context, tenant queryset, composite-key helpers. (**Target;** composite helpers Incomplete.) |
| `common/permissions` | Permission class that checks membership, access mode, and permission code. |
| `common/money` | Paise integers, currency code, rounding helpers. No float money. |
| `apps/identity` | Custom user model, verification, password reset, session login. |
| `apps/tenants` | Companies, memberships, invitations, onboarding, company settings, **and** in-app notifications / custom fields & entities (as built). |
| `apps/organization` | Departments and people. |
| `apps/authorization` | Permission catalog, templates, company roles, platform grants. |
| `apps/billing` | Plans, subscriptions, invoices, tax snapshots, provider interface. (**Partial:** trial/plan without full invoice/Razorpay stack.) |
| `apps/billing_razorpay` | Checkout, webhook verification, status mapping, reconciliation calls. (**Missing.**) |
| `apps/modules_registry` | Catalog, dependency checks, installation state machine. (**Partial:** install Implemented; uninstall/upgrade Missing.) |
| `apps/dashboards` | Versions, assignments, widget registry, data routes, navigation_for. |
| `apps/hrms` | Leave policies and leave requests. |
| `apps/notifications` | In-app notifications. (**Target package name; see tenants as built.**) |
| `apps/audit` | Append-only audit writer and company/platform read APIs. |
| `apps/platform_admin` | Operator query services and `/api/v1/platform` views. |

Business rules stay in service functions inside these apps. Views authenticate, authorize, validate, and call services. Serializers do not decide permissions or mutate subscription status.

## 3. Frontend responsibilities

The SPA presents and orchestrates. It does not:

- decide that a payment succeeded,
- pick a tenant the membership API did not return,
- treat a hidden button as authorization,
- compute MRR or invoice tax for persistence.

| Path | Owns |
| --- | --- |
| `app` | Router, providers, session bootstrap. |
| `routes` | Route table, guards that call the API and render loading or denial. |
| `features/public` | Landing page. |
| `features/auth` | Register, login, verify email, password reset. |
| `features/onboarding` | Company, billing profile, plan, checkout status, resume. |
| `features/workspace` | Shell, company switcher, overview, and (**as built**) people, org, roles, modules, billing, studio, leave, custom entities, audit, notifications pages. |
| `features/people` | Departments, people, invitations. (**Target folder; as built under workspace.**) |
| `features/roles` | Roles and permission assignment. (**Target; as built under workspace.**) |
| `features/modules` | Catalog and installation status. (**Target; as built under workspace.**) |
| `features/billing` | Subscription, interval, invoices, payment status. (**Target; as built under workspace / partial.**) |
| `features/dashboards` | Studio, preview, employee home. (**Target; studio under workspace.**) |
| `features/platform` | Operator screens. |
| `modules/hrms` | HRMS routes registered through the module manifest. (**Target; as built Leave page under workspace.**) |
| `shared/api` | Typed client generated from OpenAPI, plus the request-id header. |
| `shared/ui` | Design-system components. |
| `shared/forms` | React Hook Form and Zod field wiring. |
| `shared/auth` | Session-aware route guards. |

### 3.1 Recommended UI stack

Use these when implementation begins, and pin exact versions then:

- Vite as the build tool.
- React with TypeScript.
- React Router for routes.
- TanStack Query for server state.
- React Hook Form and Zod for forms. Zod schemas mirror API validation; they are not the authority.
- Tailwind CSS and Radix primitives for a small business design system: layout, data table, dialog, form fields, status badges, and an empty state.

The visual language is a dense operational product: clear hierarchy, restrained color, visible status for billing and access, and accessible form errors. Do not introduce a second component library in the MVP.

### 3.2 Optional module routes

Each trusted module exports a typed manifest:

```ts
type ModuleManifest = {
  slug: string;
  navItems: Array<{
    label: string;
    path: string;
    requiredPermission: string;
  }>;
  routes: Array<{
    path: string;
    requiredPermission: string;
    element: React.ComponentType;
  }>;
};
```

The workspace shell requests `GET /api/v1/companies/{company_id}/workspace`. That payload lists installed modules and permission codes. The shell renders nav items only when the slug is installed and the permission is present. The route component still calls APIs that enforce the same rules.

Core navigation is static in `features/workspace`. Module navigation is registered from `frontend/src/modules/*`. A module that is not installed is omitted. A module that is installed but not permitted is omitted from navigation and still rejected by the API if requested directly.

## 4. API and OpenAPI

- Backend route prefix: `/api/v1/`.
- drf-spectacular publishes the schema at `/api/schema/` and a documentation UI at `/api/docs/` during implementation.
- The frontend generates types from that schema. Hand-written duplicates of request bodies are limited to form-only helpers.

The endpoint catalog is [04-api-design.md](04-api-design.md).

## 5. Environments

Planning recommendation for later implementation:

| Environment | Purpose |
| --- | --- |
| local | Developer machine, test Razorpay keys, mail captured locally. |
| test | Automated tests, PostgreSQL, no live payment calls. Provider adapter is faked. |
| production | Live keys in the host secret store, HTTPS, backups enabled. |

Environment variables, not committed files, hold `SECRET_KEY`, database URL, Razorpay key id, Razorpay key secret, webhook secret, and email settings. No `.env` file is created in this planning phase.

## 6. Testing layout to add with each feature

```text
backend/apps/<app>/tests/
frontend/src/features/<feature>/*.test.tsx
```

Every tenant-owned feature adds an automated test that a membership in company A cannot read or mutate company B. Payment tests use the fake provider and the webhook idempotency cases in [08-subscriptions-and-billing.md](08-subscriptions-and-billing.md). There is no separate testing-only week.

## 7. Documentation ownership

| Concern | Canonical file |
| --- | --- |
| What exists in code vs planned | [14-implementation-status.md](14-implementation-status.md) |
| Intended target tables (proposals) | [schema.dbml](schema.dbml) |
| Column narrative, retention, postponed tables | [03-database-design.md](03-database-design.md) |
| HTTP contract | [04-api-design.md](04-api-design.md) |
| Permission codes and role templates | [05-identity-and-authorization.md](05-identity-and-authorization.md) |
| Threat model and RLS | [06-multi-tenancy-and-security.md](06-multi-tenancy-and-security.md) |
| Money, tax, MRR, Razorpay boundary | [08-subscriptions-and-billing.md](08-subscriptions-and-billing.md) |
| Decisions and unresolved items | [12-architecture-decisions.md](12-architecture-decisions.md) |
| Dynamic custom fields and entities | [13-dynamic-data-model.md](13-dynamic-data-model.md) |

If documents disagree: [14-implementation-status.md](14-implementation-status.md) wins for **repository reality**; [12-architecture-decisions.md](12-architecture-decisions.md) wins for an **explicit decision**; [schema.dbml](schema.dbml) is the **intended target-design sketch** and is not automatic implementation approval.
