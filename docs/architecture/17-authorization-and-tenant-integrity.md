# 17 — Authorization and Tenant Integrity (Phase 1 Design Freeze)

Status: **Proposed design** freeze for ADR-006, ADR-016, and ADR-021. Does **not** authorize RLS enablement or schema migrations.

## 1. Preserve existing authorization

**Current implementation (do not rewrite without explicit approval):**

- Company **permission codes** via roles (`authorization/catalog.py`, `require_permission`).
- Platform grants in a separate table/scope.
- Owner floor and last-owner protections.
- Session-cookie authentication.
- Install does not grant permissions.
- Append-only audit logs.

Five gates remain: authenticate → membership → access mode → permission → installation/entitlement (see [05-identity-and-authorization.md](05-identity-and-authorization.md)).

## 2. Action permissions versus record scopes

**Phase 1 decision:** preserve action permission codes. Do **not** explode the catalog with suffixes such as `hrms.leave.view_own` as the primary design.

**Proposed design:**

1. Caller must still hold the action code (e.g. `hrms.leave.view`, `hrms.leave.decide`).
2. A shared **service-layer scope evaluator** narrows querysets and object access (own / assigned / department / legal_entity / company-wide as applicable).
3. **Role scope metadata** (conceptual) describes which scope a role uses for a given permission family—storage shape (JSON on role, side table, etc.) is **Unresolved** pending implementation review.
4. Owners/administrators may retain company-wide scope where product policy says so; Employee leave view should become “own” once scopes ship.

**Current implementation gap:** `hrms.leave.view` lists all company requests; department-manager `people.update` object rule is documented but not enforced; `max_people` entitlement enforcement Unverified/Missing on create.

## 3. Access mode and grace (Unresolved policy)

**Current implementation:** `require_permission` treats `grace` similarly to `full` for many non-billing company permissions.

**Documentation / billing matrix** may describe stricter grace behavior ([08-subscriptions-and-billing.md](08-subscriptions-and-billing.md)).

**Phase 1 decision:** document the **mismatch as Unresolved**. No silent choice that “code is correct” or “docs are correct.” No code changes in this phase. Align in a later reviewed change.

## 4. Tenant-safe relationships and composite constraints

**Approved direction (ADR-002 / ADR-021):** children of tenant-owned parents should not reference another company’s parent; composite `(company_id, parent_id)` constraints are the design intent.

**Current implementation:** simple Django FKs; `company_id` filters in services/views.

**Proposed design (checklist items—not approved SQL):**

1. Inventory critical parent/child pairs (membership↔person, leave↔policy/person, role assignments↔roles, custom entity records↔entities, etc.).
2. Audit existing data for cross-tenant orphans or mismatches.
3. Plan expand-contract introduction of composite constraints after data is clean.
4. Keep application filters even after constraints exist.

Exact constraint list and migration order require a dedicated implementation design review. **Do not** treat [schema.dbml](schema.dbml) as auto-approved DDL.

## 5. Cross-tenant isolation tests

**Current implementation:** some org/auth tests assert company A cannot access company B.

**Proposed design (ADR-021):** before Projects/CRM coding, expand an automated matrix covering:

- Read/update/delete of foreign company ids → 404  
- Permission failure → 403  
- Where composite writes exist, reject cross-company parent pairing  
- Module routes respect installation gate  

New modules must add isolation tests in the same release as their APIs.

## 6. ADR-021 gate before Projects / CRM

**Approved:** Project Management and CRM product tables/installable modules wait until:

| # | Requirement | Notes |
| --- | --- | --- |
| 1 | Audit existing cross-tenant references | Report findings; fix defects under separate approval |
| 2 | Application-level record-scope enforcement where required | At minimum Leave `own/manage` paths—see RACI below |
| 3 | Tenant-isolation tests for in-scope surfaces | Expand matrix above |
| 4 | Appropriate composite database constraints | After audit; reviewed migrations |

Completing this gate does **not** authorize RLS enablement.

### 6.1 Leave `own/manage` scope delivery (RACI)

Do **not** explode permission codes with suffixes; use the shared service-layer scope evaluator and role scope metadata ([§2](#2-action-permissions-versus-record-scopes)).

| Slice | Ownership |
| --- | --- |
| **Slice A** (integrity / ADR-021 foundations) | Shared authorization and tenant-integrity **contract**; isolation-test **foundations**; agreed **acceptance criteria** for record scopes (including Leave `own/manage`). |
| **Slice B** (HRMS Leave harden, Person-based) | **Implementation** of Person-based Leave `own/manage` behavior and **module-level tests** against that contract. |

The integrity gate is **not** satisfied for dependent modules (including Projects/CRM) until **both** Slice A and Slice B have passed their relevant checks for Leave scopes. See also [18-module-boundaries-and-roadmap.md](18-module-boundaries-and-roadmap.md).

## 7. Cross-legal-entity access

**Proposed design:** within a Company tenant, records scoped to a LegalEntity are **not** visible or writable across LEs by default.

Future explicit sharing (if any) must be:

- Opt-in  
- Auditable  
- Designed per module (not a global “see all LE” switch without review)

Details of share grants are **Unresolved** and out of scope for first Employment/Leave migration slices.

## 8. PostgreSQL RLS — separate readiness gate (ADR-016)

**Proposed design documentation only:**

RLS remains fail-closed defense in depth for production customers, with prerequisites such as: non-owner app DB role, `SET LOCAL` tenant context per transaction, connection pooling rules, worker/context cleanup, migration role separation, platform break-glass, and tests under the restricted role.

**Explicitly not approved:** immediate RLS implementation or enablement; treating ADR-021 completion as RLS go-live.

Scaffolding timing versus enable-only-at-production remains **Unresolved**.

## 9. Platform versus company authorization

Preserve separation: company roles cannot hold `platform.*` codes. Platform operators use platform grants. Company owners who know `/platform` still receive 403 without grants (**Current implementation** intent).

## 10. Explicit non-goals

- Generic ABAC engine rewrite of permission codes.
- Resolving grace policy by undocumented code change.
- Enabling RLS in the integrity phase by default.
- Starting Projects/CRM before the ADR-021 checklist is done and accepted.
