# HRMS Phase 0 Architecture Decisions

Status: **Proposed recommendations for product-owner approval.** This is a design document only. It does not authorize application-code changes, schema changes, migrations, data cleanup, or permission grants.

This document resolves the design questions needed before HRMS implementation. It preserves current `Company`, `Person`, `User`, `CompanyMembership`, Leave, and authorization behavior unless a later explicitly approved, backward-compatible change is required. Current code facts are distinguished from the proposed target. The companion delivery plan is [implementation-roadmap.md](implementation-roadmap.md).

## Decision 1: Identity and Employment Relationships

### Problem

Pulse already separates global login identity, tenant membership, and company directory identity. Employment and LegalEntity are approved directions but have no models. A design is needed that permits employees without logins, supports concurrent employment, and does not turn a branch into a statutory entity.

### Alternatives

1. Treat `Person` as the employee/employment record and add employment fields directly to it.
2. Make `CompanyMembership` the employment record and require every employee to have a login.
3. Keep `User`, `CompanyMembership`, and `Person` distinct; add HRMS-owned `Employment` for the work relationship and a company-owned `LegalEntity` for statutory/book boundaries.

### Recommendation

Choose alternative 3. Preserve these meanings:

- `Company` is the SaaS tenant and security boundary.
- `User` is a global authentication identity; it is not company-owned.
- `CompanyMembership` is a user's access to one Company and may optionally link one Person. It is not Employment.
- `Person` is a company-owned human directory identity and may exist without a User, Membership, or Employment.
- `LegalEntity` is a Company child representing a statutory/books boundary. It is not a branch or work site.
- `Employment` is an HRMS-owned relationship for a Person with employment dates/status and HR work facts; draft/pending Employment may precede LegalEntity assignment, while active Employment must reference one. A Person can have sequential or concurrent employments as approved direction already requires.

Allow Person creation before any LegalEntity setup. Recommend allowing a draft/pending Employment to be created before LegalEntity assignment so HR can record a hire and complete pre-employment onboarding. Require a same-company LegalEntity before Employment can transition to active; do not infer or create one from a Department, branch, WorkLocation, or billing profile. A Person can exist before Employment and before a login. Payroll eligibility is separate and additionally requires active Employment, assigned effective-dated compensation, applicable statutory rules, attendance/leave inputs resolved under policy, an open payroll period, and configured approval roles. Company remains the tenant key in every API and tenant-owned row.

### Trade-offs

This avoids duplicate people and conflated security/legal boundaries and supports concurrent employment. Draft Employment enables pre-employment work before entity setup, while active Employment still requires a legal/statutory assignment. This adds an explicit transition gate and leaves companies needing only non-payroll HR to decide whether/when they establish a LegalEntity. A nullable entity on draft rows requires validation at activation; this is preferable to blocking Person or draft-hire creation. When one Person has multiple active Employments, requiring explicit context selection adds a step but prevents one job's manager, legal-entity, attendance, or payroll rights from leaking into another.

### Affected existing models and files

- Existing: [Company and CompanyMembership](../../backend/apps/tenants/models.py), [User](../../backend/apps/identity/models.py), [Person and Department](../../backend/apps/organization/models.py), [Leave models](../../backend/apps/hrms/models.py).
- Proposed: new `LegalEntity` under `apps.tenants` (provisional per ADR-019) and `Employment` under `apps.hrms`; migrations and tests in those apps.
- Architecture context: [ADR-019](../architecture/12-architecture-decisions.md), [shared domain model](../architecture/15-shared-domain-model.md).

### Migration and compatibility risks

Do not add Employment by converting or deleting Person/Membership rows. Existing LeaveRequest and LeaveBalance rows remain Person-based until the separate, explicitly approved expand-contract migration. New Employment references need same-company constraints to Person and, when assigned, LegalEntity. Draft/pending rows may omit LegalEntity; the active-state transition must require it. Entity defaulting is not decided. Concurrent employment means no global one-employment-per-Person constraint. Existing memberships remain valid when Person has zero or multiple Employment records.

For a signed-in Person with multiple active Employments, recommend an explicit Employment context selector after authentication and whenever entering a feature that depends on one. Carry the selected Employment ID in the resource path/context for each operation and validate it server-side against the caller's Person, Company, active status, and permissions. Do not select the first/oldest Employment, infer by email, or merge permissions across employments. Own and manager/team scopes are resolved independently per Employment, including its effective reporting line, LegalEntity, schedule, and delegated authority. A user who is a manager in one Employment but an employee in another receives only the scope applicable to the selected context. Person-level, non-Employment data remains separately scoped.

### Acceptance criteria

- Model/diagram and API contracts distinguish all six concepts and keep `Company` as tenant boundary.
- A Person and draft/pending Employment can exist with no User, active CompanyMembership, or assigned LegalEntity.
- A User may join a company only through CompanyMembership; no User or Person is created a second time to represent Employment.
- A Person can have multiple concurrent/sequential Employment records under approved uniqueness rules.
- When a Person has multiple active Employments, employee and manager workflows require an explicit context; the API rejects a context not owned by that Person/Company, and permissions/scopes are tested independently per Employment.
- Active Employment cannot cross Company boundaries or omit its required LegalEntity; draft/pending Employment is allowed before entity setup.
- No branch, Department, or WorkLocation is automatically treated as a LegalEntity.
- Current Leave rows, APIs, scopes, and tests remain unchanged by the initial Employment migration.

## Decision 2: WorkLocation, Department, and LegalEntity

### Problem

Departments organize teams; LegalEntities define statutory/book boundaries. Attendance also needs a physical or remote work context and timezone. Existing `Department` is the only org hierarchy and `Company` has one timezone. Architecture doc 15 suggests representing sites as organization units for v1, but does not define location-specific attendance configuration.

### Alternatives

1. Use Department/OrganizationUnitType for departments, branches, work locations, shifts, and legal entities.
2. Add a WorkLocation but make it a child of LegalEntity, assuming every site belongs to exactly one legal entity.
3. Keep Department, WorkLocation, and LegalEntity as separate concepts; relate Employment/schedule assignments to each as needed.

### Recommendation

Choose alternative 3. Keep `Department` and `OrganizationUnitType` as the organizational tree and team/manager surface. Add a company-owned HRMS `WorkLocation` for a physical site or remote-work context, with its own address/identifier and timezone where applicable. A WorkLocation may serve more than one LegalEntity; an association can be added only if a validated business workflow needs it. Relate Employment and effective-dated schedule assignments to Department and WorkLocation independently. Keep Company timezone as the company default and use WorkLocation timezone for local attendance interpretation when assigned.

Do not automatically convert an existing Department into a WorkLocation or a LegalEntity. A branch is an organizational/site concept unless an explicit legal/statutory record says otherwise.

### Trade-offs

A first-class WorkLocation supports accurate attendance policies and timezones but introduces mapping/setup work for current companies. Reusing departments is cheaper initially but overloads hierarchy semantics, makes multiple teams at one site awkward, and risks treating organization records as physical/legal identities. Multiple relationships increase configuration flexibility but require explicit validation and UI.

### Affected existing models and files

- Existing: [Department and OrganizationUnitType](../../backend/apps/organization/models.py), [Company timezone](../../backend/apps/tenants/models.py), [organization services](../../backend/apps/organization/services.py).
- Proposed: new `WorkLocation` and effective-dated assignment model in `apps.hrms`; consider a reviewed association to LegalEntity only if required.
- Architecture context: [shared domain model, Branch/location decision](../architecture/15-shared-domain-model.md).

### Migration and compatibility risks

Company timezone is already used by existing settings and must remain the fallback. Existing Departments and Person.department assignments must not be rewritten. WorkLocation rows should be additive; do not backfill them mechanically from unit names/custom fields because demo data is not authoritative. LegalEntity must remain distinct and any cross-company references must be rejected.

### Acceptance criteria

- Domain diagrams and APIs use separate IDs/types for Department, WorkLocation, and LegalEntity.
- A work site can contain multiple departments and a department can serve employees at multiple sites if the product permits it.
- WorkLocation timezone overrides the Company timezone only for attendance calculations where an effective assignment exists.
- No location/branch creation silently creates a LegalEntity.
- Existing Department hierarchy and manager behavior remain functional.

## Decision 3: Employee Onboarding Without a Pulse Login

### Problem

HR needs to record a hired employee and prepare onboarding before that employee has credentials. The current platform creates Person records and invitation memberships through distinct flows, but does not have Employment or employee onboarding workflows.

### Alternatives

1. Require account registration and active CompanyMembership before creating Person or Employment.
2. Create a User automatically for each employee and issue credentials/invitations as part of HR onboarding.
3. Let HR create/reuse Person and Employment independently; create/link a User and CompanyMembership only when the employee accepts an invitation or otherwise joins.

### Recommendation

Choose alternative 3. HR may create/reconcile the Person, create Employment, and assign onboarding tasks before a login exists. Do not create a placeholder User, password, or active membership. When employee self-service is needed, issue an invitation to the employee's verified work email and link the accepted account to the existing Person. Until an active User + CompanyMembership linked to that Person exists, employee-only APIs and UI are unavailable; HR-managed onboarding can continue.

### Trade-offs

This matches employment reality and avoids fake accounts, but divides HR task access from employee self-service and requires explicit invitation/linking state. Employees without email or who cannot yet accept an invite need an HR-assisted workflow. Email is a contact and invitation attribute, not a durable identity key.

### Affected existing models and files

- Existing: [Person](../../backend/apps/organization/models.py), [User](../../backend/apps/identity/models.py), [CompanyMembership and MembershipInvitation](../../backend/apps/tenants/models.py), [invitation services](../../backend/apps/tenants/invitations.py), [company creation/onboarding services](../../backend/apps/tenants/services.py).
- Proposed: Employment and HR onboarding/task records under `apps.hrms`; later invitation-to-Person association described in Decision 4.

### Migration and compatibility risks

Do not change current company signup/onboarding or invitation join behavior as a side effect of HRMS activation. Existing people and memberships may be unlinked or partially linked. Preserve nullable `CompanyMembership.person`. The new onboarding workflow must not require adding non-null User/Membership fields to Person or Employment.

### Acceptance criteria

- HR can create a Person and Employment without creating a User or CompanyMembership.
- HR onboarding tasks can be assigned and tracked before the employee logs in.
- Employee self-service endpoints require an authenticated active membership linked to the correct Person and applicable Employment scope.
- Accepting an invite links an existing Person; it does not create a second Person/User.
- No password or login credential is generated by employee onboarding.

## Decision 4: Invitation Acceptance and Existing Person/Employment Linking

### Problem

Current [accept_invitation](../../backend/apps/tenants/invitations.py) gets or creates a membership, then, if it has no Person, links the first company Person whose `work_email` exactly equals the invite email or creates one. `MembershipInvitation` has no Person FK, and the flow has no Employment target. This is useful compatibility behavior but an ambiguous basis for richer HR onboarding, case normalization, pre-existing links, or concurrent Employment.

### Alternatives

1. Continue email-only lookup at acceptance and select the first Person returned.
2. Bind an invitation to a specific Person when created; keep Membership linked to Person and let that identity access its authorized Employment records rather than binding a login to one Employment.
3. Bind each invitation and membership directly to one Employment, creating separate login/membership records for concurrent Employment.

### Recommendation

Choose alternative 2. Add an optional, same-company target Person reference to new invitations after a reviewed migration. At invite creation, resolve a unique normalized company Person or allow an explicit HR/owner selection. Validate the selected Person's normalized work email against the invitation address when both are present. At acceptance, lock the invitation and membership within one transaction:

1. Authenticate the invited global User using the existing invitation flow and exact invited address verification.
2. Reuse an existing company membership. If it is linked to a different Person than the invitation target, fail with a conflict and require authorized remediation; never silently relink it.
3. If there is no target, resolve only a unique normalized email match. Zero matches may follow the current create-Person behavior if the product permits it; multiple matches must stop for manual resolution.
4. Link Membership to the selected Person. Do not bind Membership to one Employment. The signed-in person may access one or more Employment records only through separate own-scope checks and explicit selection where needed.

Do not auto-select one Employment solely because it is the first or oldest. Existing invitations without a target continue through the legacy-compatible unique-match path.

### Trade-offs

Explicit Person binding prevents accidental duplicate/mislinked identities and preserves support for concurrent Employment. It requires invitation UX and a uniqueness-resolution path. Keeping membership linked to Person avoids changing platform identity semantics but means a user may need an Employment selector and strict per-employment scoping.

### Affected existing models and files

- Existing: [MembershipInvitation and CompanyMembership](../../backend/apps/tenants/models.py), [accept/join invitation services](../../backend/apps/tenants/invitations.py), [invitation views](../../backend/apps/tenants/company_views.py), [Person](../../backend/apps/organization/models.py).
- Proposed: optional invitation-to-Person FK and migration in `tenants`; Employment remains in `hrms` and is not directly assigned to User.

### Migration and compatibility risks

Existing invitation rows have no target Person and should remain null until accepted; do not backfill by arbitrary first-match. Exact-email legacy behavior is case sensitive in places while Person uniqueness is not guaranteed case-insensitive by a database constraint. Before enabling automatic matching, audit case-normalized duplicates and produce a remediation report; do not merge or alter People automatically. Preserve accepted/revoked/expired invitation history. Invitation locking and company-scoped constraints must prevent concurrent duplicate Person creation.

### Acceptance criteria

- Inviting a known Person stores/reuses that same Person identity; no second Person or User is created.
- Ambiguous normalized-email matches return a visible conflict and require an authorized explicit choice.
- A membership already linked to a different Person is never silently reassigned.
- Reaccept/retry is idempotent and preserves invitation status/audit behavior.
- Membership links to Person, not one Employment; access to multiple employments is separately authorized.
- Legacy pending invitations remain processable without destructive backfill.

## Decision 5: Reporting Relationships, Delegation, and History

### Problem

Current `Department.manager` assigns a Person as unit manager. Leave manager scope uses direct department membership and the manager Person; there is no direct person-to-person reporting relationship, indirect hierarchy, delegation, or historical record of changes. Overloading department membership cannot represent reorganizations, matrix reporting, or temporary approval delegation.

### Alternatives

1. Reuse Department.manager as the sole reporting relation and infer all team access from units.
2. Add a mutable manager FK on Person or Employment.
3. Add effective-dated reporting-line records between Employments, derive indirect teams from current/history intervals, and model delegation separately with constrained permissions and dates.

### Recommendation

Choose alternative 3, with a v1 single primary direct manager per Employment and indirect team membership derived recursively. Keep Department.manager as the existing organizational-unit manager; it remains useful for current Leave compatibility but is not the employee reporting source of truth for new HRMS features. Represent manager changes as effective-dated append-only relationship history, not destructive overwrites. Add a separate, time-bounded delegation grant with delegator, delegate, resource/action family, scope, start/end, reason, approver, and audit metadata. A delegate cannot exceed the delegator's current permission or scope and cannot receive payroll/identity-sensitive rights merely through delegation.

When a manager becomes inactive, leaves the company, or loses the relevant approval permission, preserve their historical reporting edges and already-recorded decisions. Pending approvals must not be silently reassigned based on department, hierarchy ordering, or a guessed successor. Recommend moving them to an explicit unassigned/reassignment queue. An authorized HR/workflow administrator must either assign a named eligible approver with reason and audit trail, or invoke a preconfigured fallback route (for example a designated HR approval queue). If neither exists, keep the item pending and surface a blocking exception; do not auto-approve, reject, or discard it. Historical approval records retain the actual actor and the reporting/delegation context effective at decision time.

If later product needs matrix reporting, add explicitly typed secondary relationships rather than widening the primary edge implicitly. Reject self-links and cycles; define the legal-entity boundary for reports during design approval.

### Trade-offs

Effective dating preserves historical approvals and supports indirect team views but makes queries and correction of mistaken history more complex. A single primary manager is understandable and prevents ambiguous approval routing, but does not cover matrix organizations. Delegation adds lifecycle and revocation complexity; it is safer than sharing credentials or temporarily editing roles. Explicit reassignment adds administrator work when managers leave, but avoids approval loss or unexpected privilege transfer.

### Affected existing models and files

- Existing: [Department.manager and Person](../../backend/apps/organization/models.py), [managed_person_ids and leave scope logic](../../backend/apps/authorization/scopes.py), [Leave services](../../backend/apps/hrms/services.py), [scope tests](../../backend/apps/hrms/tests/test_leave.py).
- Proposed: Employment reporting-line history and delegation models/services in HRMS/authorization, with reviewed scope helpers and tests.

### Migration and compatibility risks

Do not reinterpret or bulk-copy Department.manager as a reporting line: it may be a structural manager and can cover multiple departments. Existing Leave `own/manage/company` behavior must remain intact until a deliberate, separately tested migration of scope semantics. Historical manager corrections must not rewrite past approvals. Recursive team queries need bounded depth/cycle safeguards and indexes.

### Acceptance criteria

- Existing Department manager behavior and Leave scopes pass unchanged before any planned migration.
- A direct reporting change has effective dates and preserves the previous relationship.
- Indirect team results are deterministic, company-scoped, cycle-safe, and tested at depth >1.
- Historical records are evaluated against the relevant policy date where the use case requires it.
- Delegation is time-bounded, auditable, revocable, no wider than delegator authority, and cannot grant sensitive payroll/document permissions by default.
- Manager deactivation/departure preserves prior reporting history and routes pending approvals to an exception queue; only an authorized, audited explicit reassignment or configured fallback can resolve it.
- No code path silently selects a replacement manager or changes the historical approver of a pending/decided item.
- Self-reporting and cycles are rejected; cross-company manager links are impossible.

## Decision 6: Employee Eligibility and HRMS Activation

### Problem

HRMS installation currently seeds an Annual leave policy and unlocks leave APIs when installation status is `installed`. There is no HRMS activation/configuration state. Requiring all employees to have a login would block HR records; activating everything before payroll/location policies are configured would expose incomplete operations.

### Alternatives

1. Treat installation as full HRMS activation and make every feature available immediately.
2. Require all company-wide setup (employment, attendance, leave, payroll) before any HRMS page or employee self-service works.
3. Separate installed, setup-in-progress, and explicitly activated states; activate capabilities progressively when their prerequisites are satisfied.

### Recommendation

Choose alternative 3. Keep module installation as the existing idempotent data transition; add a resumable activation/readiness state controlled by an explicitly authorized company administrator. Do not auto-grant HR/payroll permissions. Define an employee record as HR-eligible when it has a same-company Person and an effective Employment in an eligible status/date range; an active login is not required for Person, Employment, or HR-managed onboarding to exist. Define employee self-service eligibility separately: an active User, active CompanyMembership linked to the Person, HRMS active, applicable Employment context, and explicit own-action permissions.

Recommend independent readiness gates: core employee/leave workspace; attendance (timezone, schedule, verification policy/fallback); payroll (LegalEntity, effective-dated statutory/configuration, compensation, approval roles). Missing payroll configuration must not block HR-managed employment or leave. Pending/unverified identity or ambiguous Person/Employment links blocks self-service, not the underlying HR record.

For existing installed companies, preserve working Leave APIs and data while new capabilities remain not enabled until configured. Do not backfill broad roles or pretend old installations completed new setup. Define an explicit compatibility state for the current Leave slice before implementation.

### Trade-offs

Progressive activation makes setup and product surfaces more precise but requires feature readiness state and clear UI for unavailable capabilities. A single all-or-nothing wizard is simpler but prevents useful leave/employee workflows while payroll or biometric verification is unconfigured. Compatibility behavior for existing installations requires an explicit rollout plan.

### Affected existing models and files

- Existing: [CompanyMembership, Company](../../backend/apps/tenants/models.py), [module installation](../../backend/apps/modules_registry/models.py), [HRMS installer](../../backend/apps/hrms/install.py), [installation service](../../backend/apps/modules_registry/services.py), [workspace navigation](../../backend/apps/dashboards/services.py), [authorization catalog](../../backend/apps/authorization/catalog.py).
- Proposed: activation/readiness state and services; configuration ownership in validated module config versus a new HRMS setup model must be finalized.

### Migration and compatibility risks

Adding an activation requirement to current `_installed` checks could unexpectedly disable Leave for existing tenants. Preserve installed status and legacy Leave behavior during rollout; gate only new capabilities initially or backfill a carefully defined compatibility state without granting permissions. Existing module config is empty and no configure API exists. Reinstall must be idempotent and retain all rows.

### Acceptance criteria

- Installation never creates users, duplicates People, grants roles, or runs/finalizes/pays payroll.
- Employment can exist without a login; employee self-service requires the stricter login/membership link.
- Activation is resumable and records who completed each required setup step.
- Attendance and payroll can remain disabled while HR/leave capabilities operate when configured.
- Employee access is denied if Person, Membership, Employment, tenant, status, or permission linkage is missing/ambiguous.
- Existing installed HRMS Leave routes and records remain available under current permissions during rollout.

## Decision 7: Attendance Events, Sessions, and Daily Summaries

### Problem

No attendance implementation exists in source or reachable Git history. A durable model must handle offline/device events, retries, corrections, overnight shifts and timezone differences without losing original evidence or using mutable summaries as the audit record.

### Alternatives

1. Store one mutable daily attendance row and overwrite it on every punch/correction.
2. Store only raw punches and calculate every report on demand.
3. Store append-only events as the source of truth, plus rebuildable session and daily-summary projections with calculation provenance.

### Recommendation

Choose alternative 3. Use a tenant-owned attendance event with Employment (and Person reference if needed for historical identity), event type, source/provider, occurred-at UTC, received-at UTC, source timezone/offset metadata, idempotency/provider event key, verification method/result, and minimal evidence metadata. Never store raw biometric templates. Keep original event immutable; represent correction request, approval/denial, and any accepted adjustment as separate appended records.

Derive sessions from ordered events and the assigned schedule; retain the session calculation version and event references. Produce daily summaries keyed by Employment and local work date, with the timezone and shift rule used, and version/rebuild provenance. For overnight shifts, attribute attendance to the scheduled shift's work date, not whichever UTC date the punch falls on. Store time durations in deterministic units and define rounding before implementation.

Create explicit attendance exceptions/review items rather than repairing source events in place. Recommend these dispositions: (a) missing checkout remains an incomplete session; after the assigned shift end plus configured grace, create a missing-punch exception; (b) repeated event with the same provider/idempotency key is deduplicated, while a distinct duplicate punch is retained and flagged for review; (c) out-of-order events are retained and ordered by trusted event time plus source/confidence rules, but the affected session stays provisional until reconciliation; (d) late device synchronization is accepted idempotently and triggers a versioned recomputation, retaining original receive time and prior summary versions; (e) overnight session stays attached to its scheduled work date and does not close merely because UTC midnight passed; (f) employee correction request creates a separate review item, and approval appends an adjustment rather than rewriting the punch.

Recommend marking the affected Employment/day summary `incomplete` or `pending_review` while a material exception is unresolved; do not present provisional time as verified/approved time. Payroll calculation should identify and hold the affected Employment/day line as an exception rather than silently paying zero or assuming a full shift. Whether a payroll run can finalize with such a held line, and whether a whole run or only affected lines are blocked, requires product-owner approval. Resolve exceptions through explicit policy and audited review.

### Trade-offs

Append-only source events aid audit, idempotency and offline reconciliation but increase storage and projection logic. Rebuildable sessions/summaries improve report performance but require recalculation/version management. A mutable daily row is simpler but loses provenance and makes approved corrections hard to explain.

### Affected existing models and files

- No existing attendance models/files were found. Existing foundations: [Company timezone and Membership](../../backend/apps/tenants/models.py), [Person/Department](../../backend/apps/organization/models.py), [Employment direction](../architecture/15-shared-domain-model.md), [append-only AuditLog](../../backend/apps/audit/models.py).
- Proposed: attendance event, session, summary, schedule/shift assignment, correction, and verification evidence metadata models/services in `apps.hrms`.

### Migration and compatibility risks

This is a new schema, but must be additive, company-scoped, indexed for person/employment/date queries, and protected by composite same-company constraints. Do not retrofit demo `shift` custom fields into authoritative schedules without review. Device event IDs need uniqueness/idempotency constraints. Summaries must be reproducible when rules change; do not mutate original events to rebuild them.

### Acceptance criteria

- Duplicate and out-of-order source events are safely deduplicated/reconciled.
- UTC instants and local schedule/work-date interpretation are retained distinctly.
- Overnight shifts, DST/timezone change, missing punch, duplicate punch and clock drift have documented deterministic behavior.
- Sessions and daily summaries can be rebuilt from immutable source events and versioned rules.
- Corrections append a reason, actor, decision and replacement/effect without deleting original evidence.
- Missing checkout, distinct duplicate punches, out-of-order events, late sync, overnight sessions and correction requests each create deterministic, testable exception/review behavior; source events remain immutable.
- Affected daily summaries remain visibly provisional while material exceptions are unresolved; no unresolved time is silently treated as verified payroll input.
- All rows, references, queries and reports are company-isolated and correctly Employment-scoped.

## Decision 8: Attendance Verification Policy Precedence and Fallback

### Problem

Companies may select GPS/geofence, QR, optional face/liveness, supported devices, or manual correction. Policies can be configured at company, WorkLocation, shift, and employee-group levels. Without explicit precedence or failure behavior, users may be silently granted weaker verification or be unable to record attendance during outages.

### Alternatives

1. Combine all matching policies (intersection), requiring every method to pass.
2. Let the most-specific matching policy replace broader policies; reject conflicting assignments at the same specificity; use company default only when no narrower policy applies.
3. Always fall back automatically to a generic timestamp punch when any verifier fails.

### Recommendation

Choose alternative 2 for policy resolution and reject alternative 3's silent downgrade. Recommend specificity order: employee-group assignment, shift assignment, WorkLocation assignment, then company default. If multiple policies match at the same level with incompatible rules, reject the configuration before activation rather than making runtime ordering arbitrary. The effective policy should be snapshotted/referenced on the attendance event so later configuration changes do not rewrite history.

Each policy explicitly defines allowed primary method(s), permitted fallback method(s), failure behavior, evidence metadata, consent/notice requirements and retention. On verifier outage, loss of GPS, offline device, unavailable QR, or face consent refusal, record an attempt as unverified/pending review and offer only a configured fallback. A fallback never silently upgrades a failed check into verified attendance. The employee must retain a non-biometric/manual correction path. Whether pending/unverified time counts toward attendance/payroll is a separate approved business rule; do not decide it in code implicitly.

### Trade-offs

Most-specific precedence enables different factory/site/shift rules without mixing incompatible policies. It requires understandable conflict diagnostics and a policy preview. Recording unverified attempts preserves operational evidence during outages but creates a review queue and leaves payroll treatment unresolved. Automatic universal fallback is convenient but creates spoofing and labor-dispute risk.

### Affected existing models and files

- No current verification-policy models exist. Proposed: policy, effective-dated assignment and event evidence metadata in `apps.hrms`.
- Existing: [Company timezone](../../backend/apps/tenants/models.py), [Department/OrganizationUnitType](../../backend/apps/organization/models.py), [append-only audit](../../backend/apps/audit/models.py).

### Migration and compatibility risks

No existing attendance data needs conversion. Future policy edits must be effective-dated and must not reclassify old events. Avoid retaining raw GPS traces, photos, or biometric templates. Any external face/device provider introduces processor, consent, data residency, outage, credential and deletion obligations. Do not enable a method at install time by default.

### Acceptance criteria

- Policy resolution is deterministic and explainable for each employee/shift/date.
- Conflicting same-level assignments fail configuration validation.
- A verifier failure cannot become a verified punch via silent downgrade.
- Configured fallback and manual correction paths work during offline/device/provider outages.
- Events retain only the necessary verification method/result/evidence metadata; no raw biometric templates are stored.
- Face/liveness is opt-in and disabled until explicit privacy/legal approval, consent and non-biometric alternative are provided.
- Payroll treatment of unverified/pending time is configurable/documented and not inferred by attendance code.

## Decision 9: Compensation, Payroll Runs, and Maker-Checker

### Problem

There is no payroll foundation. Payroll needs reproducible effective-dated compensation and Indian statutory calculations, confidentiality, review, finalization and payment-status tracking. Installation must never pay or finalize a run.

### Alternatives

1. Store one mutable salary per Person and calculate payroll from current values.
2. Store effective-dated compensation assignments/components and snapshot all inputs/rule versions into a draft payroll run; use explicit review, independent approval and finalization states.
3. Treat payroll as a direct payment integration that calculates, approves and pays in one action.

### Recommendation

Choose alternative 2. Compensation components and employee assignments are effective-dated and scoped to Employment (with reviewed legal-entity context). Statutory rule sets for PF, ESI, professional tax and TDS are configurable, versioned and effective-dated; never hardcode tax rates or legal rules. At calculation time, create an immutable payroll input snapshot containing the period and eligible Employment set; resolved component definitions, values and effective compensation versions; statutory rule values/versions; attendance and leave input values, statuses and source references; applicable exclusions/exceptions; currency and precision; rounding rules/version; proration and calendar settings; and calculation-engine/version identifier. Retain the calculated line items, validation outcomes and output values alongside the snapshot. A finalized run must be reproducible from this captured snapshot and engine version even if source attendance, leave, compensation, statutory rules, or current application code later changes. Do not silently recalculate a finalized run using current inputs.

Recommended lifecycle: draft → calculate → validate/exceptions → submit → independent approval → finalize → separately record payment status. A preparer cannot approve/finalize their own run (maker-checker). Finalized results are immutable; correction uses an audited reversal/adjustment run. The system does not automatically transfer money. Employees can view only their own authorized compensation and finalized payslips. Installation/configuration creates no payroll run and performs no finalization/payment.

### Trade-offs

Snapshots and segregation of duties improve auditability, reproducibility and error detection but increase data volume and payroll-operation steps. Effective-dated rules require governance/version maintenance. A strict two-person workflow may be burdensome for small businesses; any exception must be an explicit, auditable company policy and cannot be silently assumed. Payment-provider integration remains a separate future scope.

### Affected existing models and files

- No payroll or compensation models/services/routes/tests were found in source or reachable Git history.
- Reuse: [Employment direction](../architecture/15-shared-domain-model.md), [Company/CompanyMembership](../../backend/apps/tenants/models.py), [authorization](../../backend/apps/authorization/catalog.py), [append-only AuditLog](../../backend/apps/audit/models.py), [HRMS module lifecycle](../../backend/apps/modules_registry/services.py).
- Proposed: salary component/rule version, compensation assignment, payroll period/run/input/result/approval/reversal/payment status and payslip metadata in HRMS; secure file delivery design for payslips.

### Migration and compatibility risks

No existing payroll rows need migration, but all salary and payslip tables must be tenant-scoped and Employment/LegalEntity-consistent. Run inputs and final outputs require retention policy and restricted access. Avoid duplicating bank/tax data already collected elsewhere without explicit ownership review. Effective-dated rules need initial configuration; never seed statutory values as assumed legal facts. Do not change current Leave model/API as a shortcut for payroll attendance inputs.

### Acceptance criteria

- Payroll cannot calculate without explicit valid configuration, eligible Employment, period, and effective-dated compensation/statutory rules.
- Repeating a calculation with identical snapshots/rule versions is deterministic and records the calculation version.
- Mutating source compensation, attendance, leave, statutory rules, or deploying a newer calculation engine does not change a finalized run; its captured inputs, versions, rounding rules and outputs still reproduce the finalized result.
- Maker and checker are distinct authenticated actors; same-actor approval/finalization is rejected unless a separately approved explicit exception policy applies.
- Finalized runs cannot be edited; reversal/adjustment is a separately audited record.
- Payment status is not equivalent to finalization; no automatic payment occurs.
- Employees cannot view another employee's compensation/payslip; managers and HR have no sensitive payroll access by default.
- Install and activation never create, calculate, approve, finalize, or pay payroll.

## Decision 10: Tenant Isolation, Sensitive Permissions, Audit, and Retention

### Problem

HRMS will contain attendance evidence, compensation, tax/banking, identity documents, performance, and personal history. Company isolation is mandatory, while current authorization has only own/manage/company scopes and gives owner roles all company permissions through `effective_permission_codes`. Simply adding sensitive payroll codes to the current catalog could grant them implicitly to owners, conflicting with the requirement not to grant HR/payroll permissions automatically.

### Alternatives

1. Rely on frontend navigation and current broad company permissions; write HR rows with ordinary FKs and include full before/after data in audit.
2. Preserve backend `require_permission`, explicit company filters, service-layer record scopes and tenant constraints; add field/category-specific sensitive grants that require explicit assignment, including for owner roles; audit metadata/access without copying secrets; define data-class retention and deletion.
3. Replace current authorization immediately with a new ABAC/RLS-only model and move HR data to separate services/databases.

### Recommendation

Choose alternative 2. Keep Company as the tenant boundary for all reads/writes; use membership, existing `require_permission`, installed/activated gates, and service-layer own/team/HR-assigned/company scopes. Add same-company composite constraints where reviewed, retain application filters, and keep RLS as its existing separate ADR-016 production-readiness decision. Never rely on frontend visibility.

Introduce explicit restricted/sensitive permission metadata or equivalent grants for payroll compensation, bank/tax fields, identity documents, biometrics/location evidence, and payslips. These grants must not be included automatically by the current owner-role “all company permissions” shortcut, seeded onto HR/manager templates, or granted by module installation. Owners may authorize designated operators only through an explicit, auditable grant path. This is a narrow extension to existing authorization, not a replacement of roles or current Leave permissions. Keep permission action and record scope as separate gates.

Use the existing append-only AuditLog for HR changes and sensitive reads/downloads where feasible. Audit actor, company, record/category, action, request ID, result and timestamps, but do not copy passwords, tokens, raw biometric data, full bank/tax identifiers, document contents, or unnecessary GPS coordinates into audit JSON. Define separate retention schedules for payroll/legal records, attendance events, location/evidence metadata, documents and security audit with legal review; expire/delete raw evidence where permitted while retaining required non-sensitive event/audit metadata and legal holds.

### Trade-offs

Restricted grants require changes to permission metadata/resolution and role-management UX and may change owner assumptions for only the new sensitive codes. They materially reduce accidental exposure. Fine-grained scopes add query and test complexity. Retention must balance labor/tax obligations, employee privacy and auditability; exact periods cannot be inferred from code. Deferring RLS avoids expanding the approved task but leaves production hardening as a separate gate.

### Affected existing models and files

- Existing: [authorization catalog and role templates](../../backend/apps/authorization/catalog.py), [permission resolution](../../backend/apps/authorization/company.py), [record scopes](../../backend/apps/authorization/scopes.py), [CompanyMembership](../../backend/apps/tenants/models.py), [append-only AuditLog](../../backend/apps/audit/models.py), [tenant integrity migration](../../backend/apps/tenants/migrations/0013_composite_tenant_fks.py), [HRMS Leave permission enforcement](../../backend/apps/hrms/views.py).
- Proposed: restricted permission metadata/explicit grants, sensitive-field access services, access audit events, retention configuration and HR tenant constraints. Reuse existing Django modular monolith; do not create microservices.

### Migration and compatibility risks

Current owner resolution returns every company permission; introducing restricted codes must not accidentally remove owners' existing company privileges or affect current Leave behavior. New sensitive codes must be excluded from implicit owner/template grants until explicitly approved and assigned. Existing memberships/roles must not be silently expanded. New HR tables require tenant-scoped FKs and tests; audit log retention must not mutate append-only rows. RLS enablement is not authorized by this decision and remains governed by ADR-016.

### Acceptance criteria

- Direct API requests cannot cross Company boundaries even when the caller knows a foreign UUID.
- Each protected action checks authentication, active membership, access mode, permission, installed/activated status, tenant-scoped object lookup, record scope, and field-level sensitivity as applicable.
- Employee own, manager/team, HR-assigned and company scopes have explicit tests; unknown scope fails closed.
- Manager and generic HR roles cannot access compensation, bank/tax, identity documents or biometric evidence by default.
- New restricted permissions are not granted by installation, role templates, or implicit owner resolution; an explicit owner/admin action is auditable.
- Persona tests prove: (1) an Owner's implicit all-company permission result does not include restricted compensation/document/biometric permissions; (2) an ordinary HR Manager role template has no such grants; (3) a payroll operator can access only explicitly granted payroll actions and authorized Employment scopes, not unrelated HR documents; (4) an Employee can access only their own explicitly permitted compensation/payslips and cannot enumerate or fetch another Person's data; and (5) after a payroll operator's permission is revoked or membership is suspended/removed, direct API, report, export, and download requests are denied immediately, including requests using previously known IDs.
- Role combinations do not widen sensitive access by accident: permissions and scopes are resolved independently per Employment, and manager/HR roles do not inherit sensitive rights from ordinary role templates.
- Audit records are append-only and do not contain raw secrets or unnecessary sensitive payloads.
- Retention, access logging, deletion, consent/legal hold and breach response are documented per data category before enabling the corresponding collection.
- Existing Leave APIs/scopes, role grants and tenant-isolation behavior remain covered and unchanged until separately approved.

## Decision 11: HRMS Internal Domain Boundaries

### Problem

Employment, organization/location, reporting, attendance, leave, compensation, and payroll have different data lifecycles and access rules. Placing all future logic in one large `models.py`/`services.py` risks coupling; splitting immediately into many Django apps or a generic workflow framework would impose migration/import cost before the first vertical slice.

### Alternatives

1. Keep all HRMS models and business logic indefinitely in the existing flat files.
2. Refactor into separate Django apps/services for every HR domain before implementing any feature.
3. Keep the existing `apps.hrms` Django app and modular-monolith boundary; introduce domain-oriented modules incrementally as real slices require them, with explicit service/API contracts.

### Recommendation

Choose alternative 3. Preserve `apps.hrms` as the deployable module and keep all domains in the existing Django modular monolith. Establish these conceptual ownership boundaries: Employment; HR organization and WorkLocation; reporting/delegation; attendance and verification; Leave; compensation/statutory configuration; payroll and payslips; onboarding/offboarding; requests/documents; and reports. LegalEntity remains tenant-owned under the currently proposed `apps.tenants` boundary, not an HRMS duplicate.

Do not require a large package/file refactor before Phase 1. Begin new behavior in the current app conventions and extract domain-specific model/service/view modules only when the domain has enough complexity to benefit. Keep public service entry points narrow, avoid cross-domain model writes, and let attendance/leave/payroll call explicit versioned inputs rather than importing each other's private internals. Keep Django migrations within the existing monolith; do not introduce microservices, per-tenant schemas, or a generic engine that hides payroll/attendance rules.

### Trade-offs

Incremental separation avoids up-front churn and lets boundaries follow real use cases, but the first implementation slices must enforce ownership discipline to prevent a new monolithic service file. A full app split could provide stronger Django boundaries later, but changes installed-app/migration dependencies and is not justified as a prerequisite. Conceptual boundaries alone require code review and tests to prevent circular imports.

### Affected existing models and files

- Existing: [HRMS models](../../backend/apps/hrms/models.py), [services](../../backend/apps/hrms/services.py), [views](../../backend/apps/hrms/views.py), [URL routing](../../backend/apps/company_urls.py), [app config](../../backend/apps/hrms/apps.py), [LegalEntity ownership direction](../architecture/15-shared-domain-model.md).
- Proposed domain ownership remains inside `apps.hrms` except LegalEntity under the approved/proposed tenant-owned boundary. Existing Leave model/service/API ownership remains unchanged.

### Migration and compatibility risks

Creating new Django apps prematurely adds migration dependencies and can complicate HRMS install boundaries. Moving the existing Leave models/files is not required and risks import paths, migration state, test discovery, and API behavior. Keep the initial schema additive and domain-owned; any later model/file extraction must preserve migration labels/table names and public imports or include a reviewed compatibility plan.

### Acceptance criteria

- HRMS remains a normal in-repository Django app within the Pulse modular monolith.
- No microservice, Docker, per-tenant database/schema, or broad pre-Phase-1 refactor is introduced.
- Each domain has an identified model/service/API owner and does not mutate another domain's private state implicitly.
- Existing Leave model imports, migrations, APIs, authorization, and tests remain compatible.
- New domain modules are introduced incrementally and do not create circular dependencies.

## Unresolved Product Decisions

All recommendations in this document remain proposals, not approved product law. Before Phase 1, the product owner should approve or replace the following choices; counsel approval is also required for applicable privacy, biometric, payroll, and retention matters:

1. **Employment activation:** Approve draft/pending Employment without LegalEntity, the gate requiring LegalEntity before active status, eligible Employment statuses/dates, and separate payroll-readiness prerequisites. Confirm that Person creation is never blocked by entity setup and no branch/location auto-creates an entity.
2. **WorkLocation model:** Approve a first-class HRMS WorkLocation distinct from Department and LegalEntity, and confirm whether one WorkLocation may serve multiple LegalEntities.
3. **Invitation matching:** Approve storing an optional explicit Person target on invitations, the normalized-email duplicate remediation policy, and whether a zero-match invitation may still create a Person at acceptance.
4. **Employment contexts:** Approve whether concurrent active Employment is supported in v1, the explicit selector behavior when a Person has multiple active Employments, and whether own/manager permissions are evaluated independently per Employment.
5. **Reporting/delegation:** Approve one primary direct manager per Employment for v1 versus matrix managers, whether indirect team visibility is transitive, whether delegated approvals are in scope for the first release, manager scope across LegalEntities, and the fallback approver/queue for pending approvals when a manager leaves. No silent manager replacement is recommended.
6. **Activation gates:** Approve progressive feature activation versus a single all-or-nothing company activation; identify the minimum prerequisites for employee self-service, attendance, and payroll separately; decide compatibility handling for currently installed HRMS tenants.
7. **Attendance exceptions:** Approve the verification precedence/fallback and dispositions for missing checkout, distinct duplicate punches, out-of-order events, late device sync, overnight shifts and corrections. Decide whether unresolved affected lines hold payroll finalization, and whether the rest of the run may proceed. The recommendation is to keep affected summaries provisional and hold the line, never silently assume time.
8. **Verification privacy:** Approve whether face/liveness and GPS are optional providers only, the required employee consent/alternative, which evidence metadata may be retained, and who may view it. Legal/privacy counsel must approve applicable biometric/location processing before enabling collection.
9. **Payroll reproducibility and controls:** Approve immutable snapshots of all inputs, source versions, statutory rules, attendance/leave inputs, rounding rules, engine version, and output; approve maker-checker, any small-company exception, approver/finalizer/reverser authority, payslip fields, and whether Pulse will initiate payment (recommended: no initially).
10. **Sensitive permissions:** Approve restricted grants that cannot be inherited through implicit owner permissions or ordinary HR templates; decide how owners explicitly authorize payroll/document operators. Require the documented Owner, HR Manager, Payroll Operator, Employee, and revoked-operator access tests.
11. **Retention and audit:** Legal/payroll counsel must approve retention periods and deletion/legal-hold rules separately for salary/statutory records, attendance events, precise location, biometric-provider metadata, employee documents, payslips, and access/security audit.
12. **Internal domain boundaries:** Confirm the recommended incremental domain separation inside `apps.hrms` without a broad refactor or separate services before Phase 1.

After those approvals, update ADR-019/15/17/18 where the accepted choices affect shared architecture, write field-level model/API/migration designs, and only then begin implementation. No schema or application changes are authorized by this decision record.