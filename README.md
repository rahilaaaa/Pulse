# Pulse

Pulse is a multi-tenant SaaS platform. Week 1 runs the Django API and the React platform console directly on Windows. Docker is not used.

The approved architecture remains in [docs/architecture/](docs/architecture/). For what is implemented versus planned, see [docs/architecture/14-implementation-status.md](docs/architecture/14-implementation-status.md). Decisions live in [docs/architecture/12-architecture-decisions.md](docs/architecture/12-architecture-decisions.md).

## Prerequisites

- Windows PowerShell
- Python 3.12 or newer (this workspace used Python 3.14 with Django 5.2.18)
- Node.js 22 or newer
- PostgreSQL 16 or newer, listening on localhost

The existing PostgreSQL Windows service is the intended database. Create a local database and put its password only in `.env`. This checkout can also use a private data directory under `.local/pgdata` on port 5433. That directory is gitignored and is not a container.

## Backend

From the repository root:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
Copy-Item .env.example .env
```

Edit `.env` and set `SECRET_KEY`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, and `POSTGRES_PORT`. Create the database if it does not exist:

```powershell
$env:PGPASSWORD = "<your-local-password>"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -c "CREATE DATABASE pulse;"
```

Apply migrations and create the operator account. The command does not create a public registration path.

```powershell
.\.venv\Scripts\python.exe backend\manage.py migrate
.\.venv\Scripts\python.exe backend\manage.py create_platform_admin --email operator@example.com
```

Omit `--password` to be prompted. Passwords must be at least 6 characters. The command grants every platform permission to that user. It does not grant those permissions to company memberships.

Start the API:

```powershell
.\.venv\Scripts\python.exe backend\manage.py runserver 127.0.0.1:8000
```

OpenAPI is at `http://127.0.0.1:8000/api/docs/`.

Run the automated checks from the backend directory so Django discovers the test modules:

```powershell
cd backend
..\.venv\Scripts\python.exe manage.py test --settings=config.settings.test
```

If you initialized the private data directory, start it before Django:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D .local\pgdata -l .local\postgres.log -o "-p 5433" start
```

Stop it with `pg_ctl -D .local\pgdata stop`. Point `.env` at port `5433` and user `pulse` when using that directory.

## Frontend

In a second PowerShell window, from the repository root:

```powershell
cd frontend
npm install
npm run dev
```

The Vite server proxies `/api` to `http://127.0.0.1:8000`, so the session cookie stays on `localhost:5173`. Open `http://localhost:5173/login`.

Platform operators sign in with email and password. The session cookie is created after a successful password check.

Company founders register at `http://localhost:5173/register`. Verification mail is sent through SMTP when `EMAIL_HOST_PASSWORD` is set in `.env`. Gmail needs an app password on `smtp.gmail.com` port `587`, and `DEFAULT_FROM_EMAIL` must be that Gmail address. Without that password, the link is printed in the API window and does not reach the inbox. After the link is confirmed, sign in and continue at `http://localhost:5173/onboarding`. The checklist resumes at the first incomplete step: create the draft company, save the company profile, save the billing profile, then select a plan (Growth trial). GSTIN is optional and is checked for format only. Plan selection can install entitled modules such as HRMS Leave. Provider checkout and paid activation are not implemented. That company is what the platform console lists.

## Validation

From the repository root, with the virtual environment already created:

```powershell
.\.venv\Scripts\python.exe scripts\precommit.py
.\.venv\Scripts\python.exe scripts\precommit.py --full
```

The default command checks staged files for secrets when this directory is a Git repository, compiles the backend in memory, runs Django system checks with `config.settings.local`, runs `makemigrations --check --dry-run`, connects to the development PostgreSQL database, runs `migrate --check`, and type-checks the frontend with the local TypeScript compiler. It does not apply migrations or modify the development database. A mandatory failure exits non-zero. Skipped checks do not.

`--full` also runs `manage.py test --settings=config.settings.test` and `npm run build`. Django creates and removes its own separate test database for that run. The production build writes `frontend/dist`. Python lint, frontend lint, formatting, and frontend tests are reported as skipped because those tools are not configured.

After you initialize Git yourself, install the local hook:

```powershell
.\.venv\Scripts\python.exe scripts\precommit.py --install-hook
```

The hook runs the default checks and stops the commit when one of them fails. The installer does nothing until `.git` exists.

## Environment variables

| Name | Purpose |
| --- | --- |
| `SECRET_KEY` | Django secret. Local only. |
| `POSTGRES_DB` | Database name. |
| `POSTGRES_USER` | Database user. |
| `POSTGRES_PASSWORD` | Database password. Never commit it. |
| `POSTGRES_HOST` | Usually `127.0.0.1`. |
| `POSTGRES_PORT` | Usually `5432`, or `5433` for a private data directory. |
| `CORS_ALLOWED_ORIGINS` | SPA origins allowed to call the API directly. |
| `CSRF_TRUSTED_ORIGINS` | Origins trusted for session requests. |
| `DJANGO_SETTINGS_MODULE` | `config.settings.local` for development. |

## Current limits

Row-Level Security is not enabled. Platform permission checks protect the operator API; they are not a substitute for tenant isolation. Composite foreign keys described in architecture DBML are not yet applied in Django migrations. See [14-implementation-status.md](docs/architecture/14-implementation-status.md).

**Implemented (verified):** session login; founder registration and email verification; company create and onboarding profile/billing profile; Growth plan trial selection; people and departments; invitations; company roles and permission codes; custom fields and custom entities; HRMS Leave module install (when entitled) and leave request/decision APIs; workspace navigation gated by permission and installation; append-only company audit; platform operator users and companies (partial console).

**Partial:** SaaS billing (trial and plan select without Razorpay checkout, invoices, or paid webhook activation); module lifecycle (install and failed retry; uninstall/upgrade/configure APIs missing); in-app notifications under the tenants app (email delivery for preferences unverified); platform billing and modules consoles largely stubs; leave visibility is company-wide for anyone with `hrms.leave.view` (own/manage scopes not implemented).

**Planned / missing:** LegalEntity, Employment, and shared Party (approved directions in ADR-019/020; not modeled); Projects, CRM, Commerce, Inventory, Finance, and Help Desk product apps (catalog stubs only for some; Commerce not in catalog); database-backed `background_tasks`; PostgreSQL RLS (ADR-016—separate readiness decision, not approved for immediate enablement); tenant-integrity gate work before Projects/CRM (ADR-021).

The Growth plan is ₹2,499 per month or ₹24,999 per year, stored in paise. The trial does not capture a payment.
