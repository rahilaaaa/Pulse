# Pulse HRMS Implementation Roadmap

Status: repository assessment and proposed delivery plan; no HRMS feature implementation is included in this document. This roadmap records code and reachable Git history inspected on 2026-11-01. Django models, migrations, routes and tests are the source of truth for implemented features; architecture proposals, demo custom fields and catalog copy are not evidence that a feature ships.

Status labels used below: **Implemented** means working code is covered by tests or production paths; **Partially implemented** means only a subset works; **Missing** means no working implementation was found; **Proposed** means a product/architecture direction or design target, not shipped code. “Needs modification” identifies existing behavior or documentation that must change.

Phase 0 architecture recommendations and product-owner approvals are tracked in [phase-0-architecture-decisions.md](phase-0-architecture-decisions.md). Treat its recommendations as proposed until the listed decisions are approved; do not begin schema or application implementation based only on the roadmap.

The request references HRMS screenshots, but no screenshot assets were available in the material inspected for this roadmap. UI work should follow the existing Pulse workspace components and the supplied functional requirements.

## 1. Existing implementation inventory

| Area | Status | Evidence and assessment |
| --- | --- | --- |
| HRMS Django app | Partially implemented | [apps.py](../../backend/apps/hrms/apps.py), [models.py](../../backend/apps/hrms/models.py), [services.py](../../backend/apps/hrms/services.py), and [views.py](../../backend/apps/hrms/views.py) implement leave only. |
| Leave schema and migrations | Partially implemented | [0001_initial.py](../../backend/apps/hrms/migrations/0001_initial.py), [0002_initial.py](../../backend/apps/hrms/migrations/0002_initial.py), and [0003_tenant_integrity_and_scopes.py](../../backend/apps/hrms/migrations/0003_tenant_integrity_and_scopes.py) create leave policies, requests, balances, validation, and company-scoped constraints. No attendance, payroll, recruitment, performance, or HR workflow tables are present. |
| Leave API and service | Partially implemented | [company_urls.py](../../backend/apps/company_urls.py) mounts request, balance, and decision routes. [services.py](../../backend/apps/hrms/services.py) creates requests, ensures yearly balances, applies approvals/rejections transactionally, and filters own/manage/company scopes. There is no leave-policy CRUD, leave type, calendar, holiday, multi-level approval, carry-forward, encashment, or reporting API. |
| Leave installation lifecycle | Already implemented | [install.py](../../backend/apps/hrms/install.py) seeds an Annual leave policy and leaves data in place on uninstall. [modules_registry/services.py](../../backend/apps/modules_registry/services.py) gates installation; HRMS APIs return 404 after uninstall. |
| Leave tests | Already implemented | [test_leave.py](../../backend/apps/hrms/tests/test_leave.py) covers own, manager, and company visibility, out-of-scope decision denial, balance update, uninstall retention/404, and cross-company access. Authorization tests also cover leave audit behavior. |
| Person directory and organization | Partially implemented for HR use | [organization/models.py](../../backend/apps/organization/models.py) has company-owned Person, Department, OrganizationUnitType; [organization/services.py](../../backend/apps/organization/services.py) and [organization/views.py](../../backend/apps/organization/views.py) provide directory and organization APIs. Person has name, work email, job title, department, active/inactive status, and custom data, but no employment dates, employee number, manager, employment type, work location, or history. There is no Employee or Designation model. |
| Membership and authentication | Already implemented | [tenants/models.py](../../backend/apps/tenants/models.py) owns Company and CompanyMembership; membership optionally links one Person. [identity](../../backend/apps/identity/) owns global login identity. Do not treat User, Membership, Person, Employment, and Company as interchangeable records. |
| Permissions and leave scopes | Partially implemented as a platform capability | [authorization/catalog.py](../../backend/apps/authorization/catalog.py) currently seeds only `hrms.leave.view`, `hrms.leave.request`, and `hrms.leave.decide`. [authorization/scopes.py](../../backend/apps/authorization/scopes.py) resolves own/manage/company scopes, and HRMS services apply them. There are no workforce, attendance, payroll, or other HR permission families. |
| Tenant integrity | Partially implemented | [0013_composite_tenant_fks.py](../../backend/apps/tenants/migrations/0013_composite_tenant_fks.py) adds composite company/person and company/policy constraints for leave. App-level company filters remain required. [audit_tenant_integrity.py](../../backend/apps/authorization/management/commands/audit_tenant_integrity.py) reports mismatched tenant references without mutating data. |
| Audit | Already implemented platform capability | [audit/models.py](../../backend/apps/audit/models.py) enforces append-only AuditLog records. Leave decisions and person changes already write audit events. New sensitive HR mutations must use this shared log. |
| HR dashboard | Not implemented | [dashboards/services.py](../../backend/apps/dashboards/services.py) supports general role dashboards and a `hrms.leave.pending` widget, but there is no HR dashboard endpoint/page. That widget currently counts all company pending leave; do not use it as an own/manage-scoped metric without correcting the aggregation scope. |
| HRMS install catalog | Needs modification | [manifests.py](../../backend/apps/modules_registry/manifests.py) describes HRMS as leave-only. In contrast, [modules.ts](../../frontend/src/features/onboarding/modules.ts) advertises attendance, payroll, compensation, performance, and 24 permissions that are not registered or implemented. Align catalog claims with shipped features as each phase lands. |
| Frontend HRMS navigation/page | Partially implemented | [navigation.tsx](../../frontend/src/features/workspace/navigation.tsx), [AppRoutes.tsx](../../frontend/src/routes/AppRoutes.tsx), and [WorkspaceLayout.tsx](../../frontend/src/features/workspace/WorkspaceLayout.tsx) expose one permission/install-gated Leave route. [LeavePage.tsx](../../frontend/src/features/workspace/LeavePage.tsx) submits requests, shows balances and requests, and permits decisions. There is no HR workspace, nested HR navigation, or HR page set. |
| Frontend conventions | Already implemented platform capability | Existing pages use the shared API client, React Query, and shared UI states/controls under [frontend/src/shared](../../frontend/src/shared/). Extend these patterns; backend permission checks remain authoritative. |
| Attendance/payroll repository and history check | Missing | Whole-workspace source search found no attendance or payroll models, migrations, services, endpoints, tests, or frontend workflows. Reachable Git history (`git log --all`, commit subjects and historical paths) contains the HRMS leave implementation only; no prior attendance/payroll implementation paths or commits surfaced. Demo employment/shift values are custom-field fixtures, not a feature. |

### Status reconciliation

The code currently enforces Person-based Leave own/manage/company scopes and tests them. Some design-freeze text, including [17-authorization-and-tenant-integrity.md](../architecture/17-authorization-and-tenant-integrity.md) and the Leave hardening row in [18-module-boundaries-and-roadmap.md](../architecture/18-module-boundaries-and-roadmap.md), still describes those behaviors as pending or company-wide. The reconciled implementation status in [14-implementation-status.md](../architecture/14-implementation-status.md) and the current code/tests agree that this slice is implemented. Update the architecture status during a later documentation reconciliation; do not duplicate or remove the working scope logic as part of HRMS expansion.

## 2. Reusable existing models and services

| Existing capability | Reuse in HRMS | Constraints |
| --- | --- | --- |
| `tenants.Company` and `CompanyMembership` | Tenant context, active membership, and optional User-to-Person link | Every HR query and mutation must be filtered by the company in the URL after membership authorization. A membership is not employment. |
| `organization.Person` | Human directory identity and existing people UI | Do not create a second employee/person identity. Person currently has no employment contract or lifecycle history. |
| `organization.Department` and `OrganizationUnitType` | Department/team tree, manager assignment, and v1 work sites where appropriate | There is no separate Designation or Branch/Location model. Confirm whether job titles remain free text or need an HRMS-owned designation model. |
| `authorization.require_permission`, role catalog, `record_scopes` | Action authorization and own/manage/company or future scoped records | Preserve current action permissions; add service-layer scoping for every HR collection and detail operation. Do not rely on hidden navigation. |
| `audit.AuditLog` and tenant request helpers | Append-only audit trail for compensation, attendance corrections, status changes, approvals, and document verification | Do not introduce a second audit store. Restrict sensitive before/after payloads so salary, tax, and document secrets are not copied into broadly viewable audit screens. |
| `modules_registry` install/uninstall and `hrms.install` | Installed-module gate, default setup, and retain-data uninstall behavior | Installation must not auto-grant new permissions. Keep business rows on uninstall and return 404 from HRMS APIs when not installed. |
| `tenants.CustomField` / `Person.custom_data` | Optional tenant-specific, non-core attributes | Use first-class fields/models for high-query, sensitive, constrained, or cross-module facts. Custom data is not a substitute for employment, payroll, attendance, or access controls. |
| Existing leave models/services | Preserve leave request history and current Person association while extending leave policies and workflows | Employment and any LeaveRequest retargeting require a separate reviewed expand-contract migration; do not bundle that migration with feature additions. |
| Shared frontend `api`, React Query and UI components | HR pages, requests, loading/error/empty states, and cache invalidation | Keep server permission checks and company isolation regardless of client-side route visibility. |

## 3. Feature status matrix

| Requested capability | Status | Current boundary / gap |
| --- | --- | --- |
| HR dashboard, HR notifications, HR tasks, HR KPIs | Missing | Generic company overview and a pending-leave widget exist, but no complete HR dashboard; attendance, payroll, recruitment and task metrics have no source records. |
| Employee directory and search | Partially implemented | General People directory and membership search exist. HR filters, profile detail, pagination contract, employee identifiers, status history, reporting relationship, work location, employment type and documents are incomplete. |
| Employee lifecycle and employment history | Proposed; missing in code | Person active/inactive is not an employment record or lifecycle history. Employment is an approved architecture direction but has no model or migration. |
| Onboarding | Not implemented for employees | Tenant/company onboarding in `apps.tenants` is implemented; employee checklists, document collection, task ownership, verification and progress are not. |
| Offboarding | Missing | No resignation, notice, exit, return-of-assets, access revocation or final-settlement workflow. Preserve Person and historical references; never delete an employee to represent exit. |
| Time and attendance | Missing | No attendance ledger, session, shift, schedule, holiday, correction, report API, model, migration, or tests were found under backend apps or reachable Git history. Demo custom fields mentioning shifts are not an attendance implementation. |
| Leave management | Partially implemented | Basic policies, requests, balances, own/manage/company scopes, decisions, audit and uninstall retention exist. Leave types, policy configuration, annual allocation workflow, multi-level approval, holiday calendar, carry-forward, encashment, employee history and reports are missing. |
| Payroll and benefits | Missing | No payroll models, services, endpoints, migrations, tests, calculation foundation, or payslips were found in source or reachable Git history. Catalog copy is not a payroll foundation. |
| Recruitment | Missing | No requisitions, openings, candidate/application records, stages, interviews, offers or conversion flow were found. |
| Performance management | Missing | No goals, cycles, self-assessments, manager reviews, feedback, appraisal records or reports were found. |
| Employee self-service | Partially implemented | Existing self-edit of permitted Person custom fields and own leave operations provide a small base. Attendance, payslips, document access, HR requests, task tracking, and HR-specific profile controls are absent. |
| HR inbox/helpdesk | Partially implemented | Shared notifications exist in `apps.tenants`; there are no HR tickets, categories, assignment, priorities, comments, resolution history, or HR queue. |
| HR documents | Missing | No HR document metadata, private storage, category, verification, expiry, version history, or safe download endpoint was found. |
| HR reports and exports | Missing | No HR report endpoints or export workflow. The platform has no database-backed background task system; large async exports need a separately designed job capability or must be deferred. |
| HR navigation/settings | Partially implemented | One Leave link is permission/install gated through server navigation. Nested HR sections, feature-level visibility, and HR policies/settings are absent. |
| Employee workspace | Partially implemented | Existing workspace shell and own leave operations are reusable. There is no employee HR dashboard, attendance, schedule, payslip, document, HR request, or task workspace. |
| Manager workspace | Partially implemented | Existing department manager role and leave record scope provide a narrow base. There is no team attendance/correction/calendar or manager reporting workspace; manager access to sensitive compensation and identity documents must remain denied by default. |
| HR/payroll administration workspace | Partially implemented | People/organization/leave administration exists in separate pages. Unified HR configuration is missing; payroll authorization must be distinct from general HR permissions. |

## 3.1 Employee, manager, and administrator journeys

HRMS is an employee lifecycle and self-service product with three related workspaces, not just an HR operations console. Each journey is enabled only when HRMS is active, the user has an active CompanyMembership linked to the correct Person, a valid Employment context where required, and the relevant action permission and record scope. An accepted membership alone must not grant access to confidential HR data.

| Experience | Journey and permitted outcomes | Default privacy boundary |
| --- | --- | --- |
| Employee | Sign in to personal HR dashboard; see own employment profile and assigned tasks/notifications; check in/out; see attendance history, daily summaries, verification result and assigned schedule; apply for leave and see balance/status; submit HR request; see own documents and, when separately permitted, compensation and finalized payslips. | Own records only by default. Salary, bank/tax data, payslips and identity documents require explicit sensitive permissions in addition to own scope. |
| Manager | Open team dashboard and authorized team directory; review team attendance and correction requests; decide in-scope leave; view team leave calendar/reporting lines; manage team tasks/notifications and performance when separately permitted. | Manager/team scope does not imply access to compensation, banking, tax, private identity documents, or payroll actions. A manager who also has an explicitly assigned HR/payroll role uses those grants independently. |
| HR administrator | Complete activation and roster reconciliation; manage permitted employee/employment data, onboarding/offboarding, attendance policies and corrections, leave policies, documents, requests, recruitment, performance, and HR reports. | HR-wide employee access is an explicit HR permission/scope, not implied by membership, department manager, or HR navigation. Sensitive field access is separate. |
| Payroll operator/approver | Prepare salary structures and compensation assignments; open periods, calculate/validate runs, review exceptions, submit for approval, approve, finalize, and record payment status; manage permitted payslip publication. | Separate payroll permissions for compensation view/manage, calculate, approve, finalize, reverse, payment-status update, and payslip access. Do not grant these from generic HR permissions. Employees see only their own authorized compensation and finalized payslips. |

## 3.2 Company HRMS installation and activation

Current behavior: [install.py](../../backend/apps/hrms/install.py) seeds a default Annual leave policy and the module becomes installed. The module registry has no complete configuration/activation workflow; [modules_registry/services.py](../../backend/apps/modules_registry/services.py) does not establish employees or grant HRMS permissions. Keep install and operational activation as distinct concepts.

| Activation step | Proposed workflow and acceptance |
| --- | --- |
| Install/configuration initialization | Idempotently create only module-owned defaults and a setup draft. Keep module APIs gated by installed state and employee operations gated until required setup is complete. Decide whether activation state belongs in validated module config or a dedicated model; current config schema is empty and configure API is missing. |
| Reconcile people and memberships | Preview company Person rows and active memberships, identify linked/unlinked/ambiguous/inactive records, and show counts before writes. Do not create a duplicate Person or User. Use explicit, auditable linking; do not silently match on email where it is ambiguous. |
| Employment setup | After the Employment/LegalEntity design gate, create/link Employment for eligible existing People. Support multiple employments and show unresolved mappings; do not infer employment from a membership alone. No Employment schema is implemented today. |
| Bulk employee setup | Provide a permission-gated import with template, dry-run validation, row-level errors, duplicate detection, preview, explicit commit, idempotency, audit, and recoverable partial-failure semantics. Link existing identities; never duplicate people/users. |
| Organization and locations | Reuse Departments/OrganizationUnitType; collect reporting relationships and locations. Company timezone already exists on Company, but location-specific timezone/work-location configuration is not an HRMS feature. Validate manager belongs to the same company and define behavior for cycles and terminated managers. |
| Attendance and verification | Configure work schedules, holidays, verification methods and policy assignments by company/location/shift/employee group. Do not force one verification method as a universal default. |
| Leave | Configure leave types/policies, effective dates, approval paths and initial allocations; preview allocations before applying. Preserve existing LeavePolicy, LeaveRequest and LeaveBalance rows. |
| Payroll | Configure payroll calendar, effective-dated components and statutory rules, roles/approvals and sensitive access. Validate configuration; do not calculate, pay, publish payslips, or finalize a payroll run as an install side effect. |
| Approval workflows and role setup | Let an authorized owner/HR operator assign explicitly selected HR, manager and payroll roles. Offer least-privilege templates, but never silently add sensitive grants to existing or new roles. Keep HRMS installation separate from permission assignment. |
| Activation gate | Show readiness per required section, blockers and responsible actor. Activation requires an explicit authorized action and audit record. Define whether partial activation is supported; employee self-service remains disabled until its own minimum prerequisites and permission grants pass. |

Activation must be resumable, tenant-scoped, idempotent, auditable, and safe to retry. Uninstall retains rows and blocks HRMS APIs as today; it must not erase configuration, employment, attendance, payroll or audit history. Reinstall must not duplicate defaults. Define a data export/rollback procedure before enabling bulk setup for production.

## 3.3 Employee and Employment relationships

Reuse existing `tenants.Company`, `tenants.CompanyMembership`, `organization.Person`, and `organization.Department`. The intended relationship is: Company owns Person; Membership optionally links a login User to one Person in that company; HRMS Employment links a Person to a LegalEntity and represents the employment relationship. A Person can exist without login. A Person may have concurrent or sequential Employment records. A CompanyMembership is not Employment. This matches the proposed boundary in [15-shared-domain-model.md](../architecture/15-shared-domain-model.md), but Employment and LegalEntity are not implemented.

Define employee eligibility explicitly: active company membership, correctly linked same-company Person, applicable active Employment, HRMS installed and activated, and allowed self-service permission. Determine a supported path for eligible employees without logins (invite/join flow) and for non-employee People. Scope every lookup through company and Employment context; do not use email alone as a cross-record identity key. Reporting lines should be employment-aware if multiple employments are possible; architecture leaves the manager FK design unresolved.

## 4. Proposed database changes

These are design requirements, not approved field-level schema or migrations. Review each model and migration against ADR-019/021 and the architecture documents before implementation.

1. **Employment foundation:** Add an HRMS-owned Employment relationship for a Person and a LegalEntity, with reviewed employment status, dates, employee number, employment type, reporting relationship, and work location. Support concurrent employment. Decide uniqueness and active-employment rules before migrations. LegalEntity is an approved direction with provisional ownership in `tenants`, but its final attributes/defaulting strategy remain unresolved. Do not infer employment from CompanyMembership or add a duplicate Person.
2. **Person and designation boundary:** Keep the existing Person identity. Decide whether employee number and employment facts live on Employment (preferred by ADR-019) and whether designation is a company-scoped first-class model or remains a title string. Do not copy the conceptual employee fields in `schema.dbml` into current models without design review; that DBML is not live schema.
3. **Onboarding/offboarding:** Add workflow/template, assigned task/checklist, actor/assignee, due date, completion and status history; resignation/exit and asset-return/settlement states should be explicit. Preserve historical Employment, Person, documents, payroll, and audit rows on termination.
4. **Attendance and verification:** No existing ledger/session was found to reuse in repository or reachable history. Design tenant-scoped work locations/time zones, shifts, schedules/assignments, holidays, verification policies and assignments, append-only punch/verification events, derived sessions/summaries, correction requests and approval records. Store evidence metadata and provider references, not raw biometric templates or unnecessary location/photo payloads. Decide rounding, timezone, overnight shifts, missing punches, late/early grace, overtime, correction audit semantics, consent, retention, privacy notice, and employee alternatives before implementation.
5. **Leave:** Extend policy/type and approval configuration, effective-dated allocations, holidays, carry-forward/encashment rules, and approval steps without dropping current tables/columns. Preserve approved historical decisions. Keep current Person FKs until a separately approved Employment cutover; follow the zero/one/multiple Employment mapping and rollback gates in architecture doc 18.
6. **Payroll and statutory configuration:** Add versioned/effective-dated salary components, assignments, pay periods/runs, calculation inputs/results, approval/finalization states, payslip records, and audit history. Configure PF, ESI, professional tax and TDS rules as effective-dated tenant/platform data with provenance; never encode current rates in application constants. Define access boundaries for compensation and generated documents.
7. **Recruitment/performance:** Add requisitions, openings, candidates/applications, stages, interview scheduling/feedback and offers; candidate-to-employee conversion must explicitly create/link the existing Person and Employment. Add goal/cycle/review/feedback/appraisal models with scoped access and retained history.
8. **Requests/documents:** Add HR request category, assignment, priority, status transitions, comments, and resolution history. Add document metadata, private object-storage key, category, expiry, verification/version state, and access policy; files must not be served by public URLs.
9. **Tenant integrity:** Every tenant-owned model carries company context. Add company-scoped uniqueness/check constraints and indexes. Validate that all related Person/Employment/Department/Policy/Document parents belong to the same Company. Audit existing data before adding composite FKs; retain app-level filters. Do not enable PostgreSQL RLS as part of these phases without the separate ADR-016 production-readiness decision.

### Attendance verification architecture (proposed)

Verification is a configurable policy decision attached to the attendance event, not an assumption that all users or sites need the same biometric/geolocation control. Policy precedence and effective dates must be deterministic across company, work location, shift, and employee group; define a safe resolution path when policy assignments conflict or are absent.

| Method | Design requirements and privacy boundary |
| --- | --- |
| GPS/geofence | Record only the minimum coordinate/accuracy/geofence result and timestamp needed for verification. Check spoofing signals as advisory; GPS is not proof of identity. Provide non-GPS alternatives for privacy, device, disability, or indoor-location constraints. |
| QR code | Use a short-lived, signed, replay-resistant challenge bound to the intended location/shift. Do not accept a static image as sufficient verification. Retain challenge/result metadata, not unnecessary camera data. |
| Face with liveness | Treat as a high-risk optional provider integration. Require informed consent, documented legal/privacy review, a non-biometric alternative, liveness/provider result metadata, strict access/retention/deletion rules, and breach handling. Avoid storing face images/templates in Pulse unless an approved design proves necessary. |
| Biometric devices | Integrate through an explicit supported adapter/import contract with device identity, signed/authenticated transport where supported, event idempotency, clock drift handling, and reconciliation. Do not expose vendor credentials to the browser or store raw biometric traits. |
| Manual correction | Employee submits a correction with reason/evidence metadata; authorized manager/HR approves or rejects in a separate event. Preserve original punch and all decisions; correction must not rewrite append-only event history. |

Model an append-only event record with tenant, Person/Employment, event type, source, occurred-at time, received-at time, timezone/offset, idempotency/provider event key, verification method/result and minimal evidence metadata. Derive sessions/summaries as rebuildable projections with calculation/version provenance. Correction requests and approvals are separate auditable records. Protect against duplicate check-ins, replayed/offline events and out-of-order delivery. Define offline queue signing/idempotency and conflict-resolution rules; device timestamps alone are not trusted. Set configurable retention and access logging for location/evidence; support deletion/expiry where legally required without mutating the event audit trail.

## 5. API requirements

Retain the current company path convention in [company_urls.py](../../backend/apps/company_urls.py): `/api/v1/companies/{company_id}/hrms/...`. Existing leave routes remain compatible. For every endpoint, enforce authenticated session, active membership, subscription/access policy, action permission, HRMS installation, tenant-scoped lookup, and record scope on the backend.

Required endpoint groups, added with each phase:

| API group | Required operations |
| --- | --- |
| Activation and bulk setup | `GET/PATCH .../hrms/activation/` for readiness/configuration; preview/dry-run and explicit commit for people/employment reconciliation and bulk import; report row errors; explicit activate action. Every write permission-gated, tenant-scoped, idempotent where retryable, and audited. Final route names are implementation design. |
| Employee self-service | `GET .../hrms/me/` and own employment/profile, dashboard, tasks, notifications and requests. Resolve the employee from authorized membership/Person context; do not accept arbitrary person IDs for own routes. |
| Dashboard | Separate employee-own, manager-team and HR/admin summaries/action queues, each scope-filtered server-side. Omit unavailable metrics rather than fabricate values. |
| People/employment | Filter/search directory and employee profile reads/updates through existing People APIs where appropriate; HRMS employment/history endpoints for HR relationship data. Avoid duplicate generic People CRUD. |
| Onboarding/offboarding | Workflow list/detail/create, assign/complete checklist tasks, collect/verify documents, request/approve exit, track notice and settlement status; never delete the Person/Employment to mark exit. |
| Attendance | Check-in/out; daily/session/calendar query; schedule/shift/location/holiday policy administration; verification policy preview/assignment; correction request/approve/deny; device-event ingest/reconcile; scoped summaries/reports. Preserve immutable event history and idempotent ingestion. |
| Leave | Preserve request/balance/decision routes. Add policy/type management, allocation, calendar, approval-step actions and reports with date/balance validation. |
| Payroll | Salary structures/components and employee compensation assignments; effective-dated statutory config; period/run create, calculate, validate, exception review, submit/approve/finalize/reverse; payment-status record; employee own finalized payslip list/detail/download. Enforce transactions/locking/idempotency; no installation-triggered run, payment, or finalization. |
| Recruitment/performance | Requisition and candidate/application lifecycle, interview feedback/offer decisions; goals/cycles/assessment/review workflows. |
| HR inbox/documents/reports | Create/assign/comment/resolve tickets; upload/verify/list/download documents via authorization-checked streaming; scoped reports and permission-checked export. |

Use the existing API exception/validation conventions and service layer. Use atomic transactions and row locks for competing approvals, balance updates, payroll runs/finalization, and status transitions. Use 404 for foreign-company objects and 403 for denied actions consistently. Audit sensitive changes with actor, company, request ID, before/after metadata that does not expose secrets. Never accept company identity from the request body as a substitute for the path.

## 6. Frontend requirements

- Evolve the current `/app/hrms` route into an HR workspace with Overview, People, Attendance, Leave, and later modules added only when their APIs and workflows are implemented.
- Add feature-level navigation metadata to the server-authorized workspace contract; filter by both permission and HRMS installation. Current `NAV_CATALOG` provides one module-level HRMS entry, not per-feature navigation.
- Reuse [WorkspaceLayout.tsx](../../frontend/src/features/workspace/WorkspaceLayout.tsx), [navigation.tsx](../../frontend/src/features/workspace/navigation.tsx), [client.ts](../../frontend/src/shared/api/client.ts), React Query and `shared/ui` controls. Keep the existing People directory as the general identity surface; link to HR profile detail rather than duplicating that directory.
- Use actual API data for KPI cards; do not show payroll, attendance, recruitment or task metrics until their records and scoped aggregations exist. Dashboard empty states must distinguish zero from unavailable/not authorized.
- Each implemented list/detail/form needs search/filter/sort/pagination where the dataset requires it, accessible controls, confirmation for consequential actions, and loading/error/empty/success states. Mutations invalidate the relevant query keys.
- Sensitive salary, bank/tax, identity-document and attendance-location details must be omitted from unauthorized payloads, not merely hidden in React. Provide authorized download handling for private documents and payslips.
- Keep responsive behavior and Pulse design tokens/components. Align onboarding marketplace copy with actual shipped capability after every release; do not continue advertising unimplemented payroll/attendance as available functionality.

### Required pages by experience (proposed)

| Experience | Pages/views |
| --- | --- |
| Employee | HR home/personal dashboard; My Profile/Employment; Check in/out and verification result; Attendance history/calendar/day detail; Shift and schedule; Leave balances/application/status/history/calendar; Compensation summary and finalized payslips; My Documents; HR Requests/Helpdesk; Tasks and Notifications. Render only features implemented, activated and permitted. |
| Manager | Team overview; scoped team directory/profile; team attendance/calendar; correction approval queue and decision detail; leave approval queue/team calendar; reporting relationships; team goals/reviews when authorized; team tasks/notifications. Never infer salary/document access from manager scope. |
| HR administration | Activation wizard/readiness and bulk setup; employee directory/profile/employment history; onboarding and offboarding; attendance administration, shifts/locations/verification policies; leave policy/allocation/approval administration; documents and HR requests; recruitment; performance; HR reports/settings. |
| Payroll administration | Compensation structures and effective-date configuration; employee salary assignment; statutory rule configuration; payroll periods/runs, calculation exceptions, review/approval/finalization, payment status and payslip publication; audit/reversal history. Display only pages/actions granted by the corresponding separate payroll permission. |

Navigation should be grouped by employee, manager, HR and payroll workflows where roles overlap; it is derived from server permissions plus installation/activation state. Keep shared links to the existing People and Organization modules where those remain the owning platform surface. A route hidden in React is not an access control.

## 7. Permissions and scopes

Existing codes are limited to `hrms.leave.view`, `hrms.leave.request`, and `hrms.leave.decide`. Add explicit action codes as each API ships, seed them in [authorization/catalog.py](../../backend/apps/authorization/catalog.py), and update role templates deliberately. Proposed families (final code names to be reviewed before implementation):

| Family | Example actions |
| --- | --- |
| Workforce | view, manage, view_sensitive |
| Onboarding/offboarding | view, manage, approve, complete_tasks |
| Attendance | view, check_in, check_out, manage_schedules, request_correction, approve_correction, view_sensitive |
| Leave | retain view/request/decide; add policy_manage, allocation_manage, report_view if separate authorization is required |
| Payroll/compensation | view, view_sensitive, manage_compensation, calculate, approve, finalize, reverse, report_view |
| Recruitment | view, manage_requisition, manage_candidate, interview_feedback, offer_approve |
| Performance | view, manage_goals, submit_self_review, manage_reviews |
| HR requests/documents/reports/configuration | view/create/assign/resolve; document_view/upload/verify; report_view/export; settings_manage |

Reuse action codes plus the service-layer record-scope approach in `authorization.scopes`; do not encode scope solely as frontend navigation or proliferate `_own` permission variants. Define own / manager / HR-assigned / company visibility per resource, including sensitive-field rules. Enforce object-level authorization on detail, mutation, exports and downloads. Module installation never grants permissions. Decide how existing custom company roles receive newly seeded permissions; never silently expand their grants.

### Permission and record-scope matrix (proposed)

An action permission and a record scope are separate checks. “Manager/team” means only current, authorized reporting relationships in the same company (and, where selected by design, Employment/LegalEntity); it does not mean every person in an organization unit by default.

| Data/action | Employee | Manager | HR | Payroll |
| --- | --- | --- | --- | --- |
| Own profile/basic employment | Own read; permitted self-edit only | Own plus team fields granted | Company/assigned workforce per HR scope | No implied access |
| Attendance | Own check-in/out, own history and verification result | Team summaries and corrections only when separately granted | Assigned/company attendance manage/view | No implied access |
| Leave | Own balance/request/status | In-scope team request/approval/calendar | Assigned/company policy/allocation/approval | No implied access |
| Compensation/salary | Own view only with explicit sensitive permission; finalized own payslips | No access by manager scope alone | No access by HR scope alone unless separately granted | Explicit compensation view/manage and payslip permissions with defined employee/company scope |
| Payroll operations | None | None by default | None by default | Separate calculate, approve, finalize, reverse and payment-status grants; maker/checker separation where configured |
| Documents | Own permitted employee documents | No identity-document access from team scope | View/upload/verify only per document category and HR scope | Payslip access only; no general identity-document access |
| HR requests/tasks | Own create/status and assigned tasks | Team-assigned queue when authorized | Assigned/company queue and resolution | Payroll-specific queue only if assigned |
| Reports/export | Own data only if specifically offered | Team-scoped only | HR-scoped by report permission | Payroll-scoped by separate report/export permission |

Unknown, missing, or conflicting scope metadata must fail closed. Manager access should be revoked/reevaluated when reporting relationships, membership status, or Employment changes. Sensitive fields require both action permission and an allowed record scope; audit visibility does not grant access to the underlying payroll/document content.

## 8. Dependencies and implementation gates

| Capability | Depends on |
| --- | --- |
| HR dashboard/navigation | Existing membership, permissions, installation and People/Leave APIs; each card depends on its owning data model and matching record-scope aggregation. |
| Employee profile | Person and Organization APIs; Employment/LegalEntity design for contract, dates, multiple employments, history, and employee number. |
| Onboarding/offboarding | Employment lifecycle design; task/checklist and secure document capabilities; permissions/audit. |
| Attendance | Person/Employment decision, work timezone, shifts/schedules/holidays, event ledger, correction approval and scope design. |
| Leave expansion | Existing models/routes/tests. Rich policy configuration can proceed on current Person relation; Employment retargeting is a separate, explicitly approved migration after LegalEntity/Employment design and mapping gates. |
| Payroll | Employment and effective-dated compensation/statutory configuration, approval authority, sensitive-data policy, and payslip storage. |
| Recruitment | Candidate/application domain; conversion must reuse Person and Employment. |
| Performance | Employment/manager relationship and review-cycle scope. |
| HR Inbox and documents | Assignment/notification model, private storage and document access controls. |
| Reports/exports | Shipped source modules and scopes. Background/asynchronous exports depend on a designed task capability; none currently exists. |
| Verification integrations | Attendance event contract and company policy first; then provider/device adapters, threat model, consent and retention policy. Each provider is optional; manual correction remains an approved alternative. |
| HRMS activation | Current module registry lifecycle plus a new validated configuration/readiness state and permissioned setup APIs. Do not treat installed status alone as completed onboarding or self-service activation. |

Before adding HRMS schema, review migration field design, data retention, indexes, composite tenant constraints, deployment/rollback and existing-row behavior. Existing current migrations already add leave composite constraints. Do not run destructive migrations or alter historical leave relationships as part of this assessment.

## 9. Phased implementation plan

| Phase | Scope and exit criteria | Status |
| --- | --- | --- |
| 0. Design and preservation gates | Resolve the unapproved recommendations and owner questions in [phase-0-architecture-decisions.md](phase-0-architecture-decisions.md): draft/active Employment and LegalEntity gates; multi-Employment context; location/reporting/delegation and manager departure; activation readiness; attendance exceptions/verification; payroll snapshots/maker-checker; restricted permission tests; internal domain boundaries; tenant, privacy, migration and retention. Reconcile stale Leave scope notes. | Proposed; awaiting product-owner approval |
| 1. HRMS activation and roster reconciliation | Add resumable setup state, readiness checklist, Person/membership/Employment reconciliation preview, duplicate/ambiguity handling, bulk import dry-run/commit, location/organization setup, leave configuration/allocation preview, role assignment and explicit activation. Installation alone grants no permissions and performs no payroll action. | Proposed; not started |
| 2. Employee identity, Employment and self-service foundation | Implement approved Employment model and reviewed profile/API. Create own HR home, profile, tasks/notifications and leave/People integration, backed by active membership, Person, Employment, permission and scope checks. No duplicate identity creation. | Proposed; not started |
| 3. HR and manager workspaces | Add scoped HR dashboard, directory/profile navigation, manager/team surfaces, approvals and HR admin navigation. KPI cards use real, scope-filtered source records only. Separate HR-wide and team permissions. | Proposed; not started |
| 4. Attendance core and verification | Implement append-only event ingestion, derived sessions, shifts/schedules/locations/timezones, employee check-in/out, own/team/admin views, correction approval and policy assignments. Add optional GPS/geofence, QR, face/liveness and supported device adapters only after privacy/security review; support offline reconciliation and manual alternative. | Missing; proposed |
| 5. Complete leave management | Extend types/policies, allocations, multi-step approvals, calendar/holidays, carry-forward/encashment as approved, history and reports. Preserve current API/data and tested record scopes. Employment cutover remains a separate, explicitly approved migration. | Partially implemented (basic leave exists) |
| 6. Payroll and benefits | Build effective-dated compensation/statutory configuration, deterministic calculation and validation, exception review, maker/checker approvals, finalization/reversal, payment status and finalized payslips. No hardcoded rates, automatic payment, or install-time finalization. | Missing; proposed |
| 7. Onboarding and offboarding | Add lifecycle workflows, responsible personnel, documents/tasks, progress, resignation/approval/notice, exit and settlement checklists. Retain records; revoke membership access through existing platform workflows, not deletion. | Missing; proposed |
| 8. Recruitment and performance | Build requisitions/openings/candidates/interviews/offers and explicit conversion to existing Person plus Employment; then goals, cycles, self-assessment, manager review, feedback and appraisal with scopes. | Missing; proposed |
| 9. HR inbox, documents and tasks | Add assigned employee requests/tickets, comments/resolution, notifications, private document repository, verification/expiry/history and authorized downloads. | Missing; proposed |
| 10. Reports, analytics and integration | Add scoped headcount/attendance/leave/payroll/recruiting/turnover/department reports, permission-checked exports, cross-module E2E tests, performance/privacy review and documentation/catalog reconciliation. | Missing; proposed |

The phase order is a delivery sequence, not permission to invent unresolved schema. Employment/LegalEntity-dependent work waits on phase 0 decisions. Preserve the architecture requirement that any eventual Leave Person-to-Employment data migration be backward-compatible, explicitly approved, separately deployed, audited, validated for zero/one/multiple employment mappings, and reversible until all gates pass.

## 10. Testing strategy

For every phase, add backend model/service/API tests and frontend interaction tests for that shipped slice. The existing [HRMS leave tests](../../backend/apps/hrms/tests/test_leave.py) are the local pattern for API-level tenant and role workflows.

- **Tenant and permission matrix:** company A cannot read/write company B rows; unauthenticated/inactive membership and missing permission are denied; foreign object IDs are 404; installed-module checks are enforced. Cover own, manager/assigned, and company scope for list, detail, mutation, aggregate, report, export and download paths.
- **Persona acceptance:** employee can see and operate only own allowed features; manager can complete team tasks/approvals within the current team scope but cannot read salary, bank/tax, or identity documents without separate grants; HR can administer only explicitly scoped workforce features; payroll actors are separately authorized for each compensation and payroll transition. Test routes directly, not just hidden navigation.
- **Activation/import:** install is idempotent and does not grant roles, create duplicate Person/User rows, allocate payroll, or finalize/pay a run. Reconciliation covers already linked, unlinked, inactive, duplicate, ambiguous, multiple Employment and no-membership cases; preview is read-only, commit is permissioned/audited/retry-safe, and activation cannot pass with unresolved required setup. Uninstall/reinstall retains rows and does not duplicate defaults.
- **Validation and constraints:** invalid dates/status transitions, duplicate employee identifiers, cross-company FK references, overlaps, balance limits, missing/expired document, invalid payroll inputs, and effective-date boundaries. Assert DB constraints as well as friendly API errors.
- **Transactions/concurrency:** concurrent leave approvals and balance changes; attendance correction approval; payroll calculate/approve/finalize; idempotent retry behavior. Verify rolled-back work leaves no partial state.
- **Attendance verification/privacy:** valid/invalid/expired/replayed QR, GPS accuracy/geofence boundaries and unavailable location, optional face-provider liveness failure/timeout/consent denial, device duplicate/out-of-order events, offline event replay, timezone/DST and overnight shifts, clock drift, retention/deletion, and fallback/manual correction. Ensure raw biometric data is not persisted or exposed absent approved requirements.
- **Payroll controls:** effective-date boundaries, statutory rule versions, rounding/reproducibility, missing inputs, zero/negative net pay policy, segregation of duties, approval conflicts, immutable finalized run, audited reversal, employee cannot read another employee payslip, manager denied compensation by default, and installation never creates or finalizes a payroll run.
- **History and audit:** append-only attendance and audit history, before/after actor/request metadata, no sensitive secret leakage, employment termination/offboarding retains historical HR and business rows, and module uninstall retains records while APIs are unavailable.
- **Migration tests:** `makemigrations --check --dry-run`; migrate from current schema with representative leave/person/membership data; verify forward counts and constraints. For any future Employment cutover, test zero/one/multiple employment cases, unresolved mappings, rollback, and unchanged leave authorization behavior. Do not use database flush/reset as a migration test.
- **Frontend workflows:** test navigation gating, directory search/filter/detail, forms and confirmation dialogs, approval decisions, loading/error/empty/success states, responsive interaction, cache invalidation and server-denied actions. No frontend test runner is currently documented as configured; select/add one in the implementation phase or record that UI interaction coverage is not yet runnable. The README documents Django test and production build checks.
- **Release acceptance:** do not label a capability complete until API, permissions, tenant isolation, migrations, audit/history, and user workflow tests pass end to end. Run backend checks from [README.md](../../README.md) and the configured frontend build; add phase-specific test commands as the test tooling is established.

## Assessment conclusion

Pulse currently has a usable Person-based leave slice and shared platform foundations, not a broad HRMS. Whole-workspace search and reachable Git history surfaced no existing attendance or payroll implementation to preserve. Demo shift/employment custom fields and onboarding marketplace copy are not working feature foundations. Employee-as-employment, attendance verification, payroll, recruitment, performance, HR tickets, and HR documents are missing or proposed. Preserve Person/CompanyMembership/authorization/audit/module contracts; make installation distinct from activation; provide own/team/HR/payroll scopes with sensitive data separated; and review Employment/LegalEntity and privacy/security designs before dependent phases.