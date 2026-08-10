# TaskLaunch Trusted Automation

## Product Requirements Document

**Status:** Draft for implementation\
**Product:** TaskLaunch\
**Feature:** Trusted Automation\
**Parent capability:** Executive Function Engine\
**Preceding features:** Intelligent Brain Dump; Task Clarification and
Decomposition; Next Best Action; Daily Executive Brief; Adaptive Daily
Capacity; Automatic Schedule Repair; Recovery Mode\
**Primary objective:** Safely orchestrate approved low-risk Executive
Function actions while preserving explicit consent, deterministic safety
gates, auditability, pause controls, and progressive trust.

## 1. Product Summary

Trusted Automation coordinates the existing Executive Function services
so safe maintenance and planning operations can occur without manual
initiation every time. It orchestrates existing services rather than
duplicating their business logic.

Automation authority comes only from product-defined rule capability,
user consent, current trust level, server-side safety validation,
current entity state, and the owning feature's mutation contract.

> Automate maintenance and low-risk decisions first. Preserve human
> control over consequential changes.

## 2. Product Principles

The system must be deterministic in authority decisions, explicitly
consented, user-pausable, auditable, idempotent, reversible where
possible, fail-closed, privacy-conscious, backward-compatible, and
progressive rather than all-or-nothing. AI must never determine its own
execution permissions.

## 3. Goals

The MVP must provide:

-   Canonical automation rule catalog
-   Explicit trust levels
-   Per-user rule permissions and consent
-   Global pause/resume
-   Deterministic domain events and trigger registry
-   Server-authoritative safety pipeline
-   Queueing, entity locks, idempotency and bounded retry
-   Immutable execution audit history
-   Existing-feature adapters
-   Cross-feature propagation and conflict handling
-   User-readable settings and history
-   Trust progression recommendations
-   Security/privacy hardening
-   Observability, kill switches and staged rollout

## 4. Trust Model

``` text
OFF
ASSISTED
TRUSTED
```

**OFF:** rule does not execute.

**ASSISTED:** TaskLaunch may detect a condition and prepare a
result/proposal, but consequential mutations require confirmation.

**TRUSTED:** TaskLaunch may execute only operations explicitly declared
eligible for automatic execution.

A rule executes only when it exists, is enabled, automation is not
paused, requested trust is supported and granted, ownership is valid,
the feature is available, entity versions are current, conflicts/locks
permit execution, safety gates pass, and the execution is not a
duplicate or replay.

## 5. Prohibited TRUSTED Actions

``` text
DELETE_TASK
ARCHIVE_TASK
CHANGE_HARD_DEADLINE
CHANGE_RECURRENCE_RULE
SHARE_TASK
UNSHARE_TASK
SEND_EXTERNAL_MESSAGE
MODIFY_ACCOUNT
MODIFY_SUBSCRIPTION
MODIFY_PRIVACY_SETTINGS
BULK_DELETE_HISTORY
IMPORT_EXTERNAL_DATA
EXPORT_USER_DATA
```

## 6. Initial Rule Catalog

``` text
REFRESH_DAILY_EXECUTIVE_BRIEF
REFRESH_NEXT_BEST_ACTION
REFRESH_ADAPTIVE_CAPACITY
EXPIRE_STALE_RECOMMENDATIONS
EXPIRE_STALE_SCHEDULE_REPAIRS
EXPIRE_STALE_RECOVERY_SESSIONS
CLEANUP_ABANDONED_BRAIN_DUMPS
REFRESH_AFTER_TASK_MUTATION
REFRESH_AFTER_SESSION_COMPLETION
REFRESH_AFTER_CAPACITY_OVERRIDE
PREPARE_SCHEDULE_REPAIR
PREPARE_RECOVERY_MODE
```

New rules default to `OFF` or `ASSISTED`. Unknown rule IDs and
unsupported schema versions fail closed.

## 7. Rule Capability Contract

``` ts
interface AutomationRuleDefinition {
  id: AutomationRuleId;
  schemaVersion: number;
  supportedTrustLevels: Array<"ASSISTED" | "TRUSTED">;
  mutationClass:
    | "READ_ONLY"
    | "MAINTENANCE"
    | "PROPOSAL_GENERATION"
    | "LOW_RISK_MUTATION"
    | "HIGH_IMPACT_MUTATION";
  defaultTrustLevel: "OFF" | "ASSISTED";
  requiresEntityLock: boolean;
  supportsRetry: boolean;
  maxRetries: number;
  prohibitedInTrustedMode: boolean;
  featureOwner: string;
}
```

## 8. Per-User Policy

Suggested path:

``` text
users/{userId}/automationPolicy/current
```

``` ts
interface UserAutomationPolicy {
  userId: string;
  globallyPaused: boolean;
  rules: Record<AutomationRuleId, {
    enabled: boolean;
    trustLevel: "OFF" | "ASSISTED" | "TRUSTED";
    updatedAt: string;
    consentVersion: string;
  }>;
  updatedAt: string;
  schemaVersion: number;
}
```

Server-side policy evaluation is authoritative.

Pause-all prevents new and queued non-started executions while
preserving completed audit history and rule settings. Resume must not
blindly replay expired events.

## 9. Domain Event Envelope

``` ts
interface AutomationDomainEvent<T = unknown> {
  eventId: string;
  eventType: string;
  schemaVersion: number;
  userId: string;
  occurredAt: string;
  receivedAt: string;
  entityType?: string;
  entityId?: string;
  entityVersion?: string;
  correlationId?: string;
  causationId?: string;
  payload: T;
}
```

Example events include `TASK_CREATED`, `TASK_UPDATED`, `TASK_COMPLETED`,
`TASK_SESSION_COMPLETED`, `CAPACITY_OVERRIDE_CHANGED`,
`SCHEDULE_REPAIR_APPLIED`, `RECOVERY_COMPLETED`, `BRAIN_DUMP_COMPLETED`,
`CLARIFICATION_APPLIED`, and `LOCAL_DATE_CHANGED`.

Events should contain the minimum structured data necessary.

## 10. Execution Lifecycle

``` text
QUEUED
VALIDATING
RUNNING
SUCCEEDED
FAILED_RETRYABLE
FAILED_TERMINAL
CANCELLED
SKIPPED
EXPIRED
```

Suggested paths:

``` text
users/{userId}/automationExecutions/{executionId}
users/{userId}/automationAudit/{auditId}
```

Audit records are immutable.

## 11. Error Categories

``` text
AUTHENTICATION_FAILED
OWNERSHIP_FAILED
RULE_DISABLED
AUTOMATION_PAUSED
TRUST_NOT_GRANTED
RULE_NOT_SUPPORTED
SCHEMA_UNSUPPORTED
STALE_ENTITY
CONFLICT
LOCK_UNAVAILABLE
DUPLICATE_EXECUTION
RATE_LIMITED
FEATURE_UNAVAILABLE
VALIDATION_FAILED
RETRYABLE_DEPENDENCY_FAILURE
TERMINAL_DEPENDENCY_FAILURE
SAFETY_GATE_FAILED
EXPIRED
UNKNOWN_ERROR
```

## 12. Queue, Locks, Idempotency and Retry

Executions use deterministic priority, FIFO within priority, bounded
concurrency, per-user fairness, cancellation, expiry, retry scheduling,
and duplicate suppression.

Entity-mutating rules use expiring locks when required.

Suggested idempotency key:

``` text
userId + ruleId + eventId + targetEntity + ruleVersion
```

Suggested retry policy:

``` text
Maximum attempts: 3
Backoff: exponential with jitter
```

Do not retry authorization/trust failures, disabled rules, safety
failures, unsupported schemas, user cancellation, or stale actions
requiring regeneration.

## 13. Deterministic Safety Pipeline

``` text
1. Authenticate
2. Validate event schema
3. Load rule definition
4. Verify rule enabled
5. Verify global pause
6. Verify trust permission
7. Verify feature availability
8. Verify ownership
9. Verify entity version
10. Check replay/idempotency
11. Check conflicts
12. Acquire lock if required
13. Run feature safety gate
14. Execute through owning feature service
15. Persist result
16. Release lock
17. Emit downstream event
```

## 14. Feature Ownership and Adapters

Trusted Automation orchestrates; it does not duplicate business logic.

-   Daily Executive Brief owns daily planning.
-   Next Best Action owns task ranking.
-   Adaptive Daily Capacity owns capacity calculation.
-   Task Clarification owns decomposition.
-   Schedule Repair owns repair proposals/apply.
-   Recovery Mode owns recovery proposals/apply.
-   Brain Dump owns extraction/session lifecycle.

Trusted planning refresh candidates include Daily Brief, Next Best
Action and Adaptive Capacity refreshes.

Brain Dump automation may clean/expire stale sessions but cannot create
tasks without confirmation.

Task Clarification automation may expire or prepare recommendations but
cannot automatically apply clarification changes in MVP.

Schedule Repair and Recovery Mode automation may detect eligibility,
prepare/refresh/expire proposals, and surface them for review.
Consequential task mutations remain explicitly confirmed.

## 15. Cross-Feature Propagation

Example:

``` text
TASK_SESSION_COMPLETED
→ REFRESH_ADAPTIVE_CAPACITY
→ CAPACITY_UPDATED
→ REFRESH_DAILY_EXECUTIVE_BRIEF
→ DAILY_BRIEF_UPDATED
→ REFRESH_NEXT_BEST_ACTION
```

Propagation must be ordered, cycle-safe, idempotent, correlation-aware,
and tolerant of partial failure.

Conflict precedence:

1.  Security/policy restrictions
2.  User-triggered execution
3.  Owning feature mutation contract
4.  Newer entity version
5.  Higher automation priority
6.  FIFO within equal priority

Use correlation IDs, causation IDs, maximum propagation depth, cycle
guards, and duplicate suppression.

## 16. API Surface

``` http
GET /api/automation/settings
PUT /api/automation/settings
POST /api/automation/pause
POST /api/automation/resume
GET /api/automation/history
GET /api/automation/history/{executionId}
POST /api/automation/execute
POST /api/automation/executions/{executionId}/retry
POST /api/automation/executions/{executionId}/cancel
```

Domain-event dispatch should use a trusted internal server boundary.

## 17. Settings, Consent and History UX

Example settings:

``` text
AUTOMATION

Pause all automation
[ Pause ]

Daily planning
Keep Daily Brief up to date
[ Trusted ]

Next action
Keep Next Best Action up to date
[ Trusted ]

Schedule Repair
Prepare repair suggestions when needed
[ Assisted ]

Recovery Mode
Prepare Recovery Mode when backlog builds up
[ Assisted ]
```

TRUSTED consent must state exactly what can happen automatically.

Automation history should explain what happened, why, whether anything
changed, whether approval was required, whether it succeeded, and
whether retry/review is available.

## 18. Trust Progression

Trust escalation is recommendation-based and never automatic.

After repeated successful assisted executions, TaskLaunch may offer:

``` text
Allow TaskLaunch to run this automatically next time?

[Allow automatically] [Keep assisted]
```

Trust reduction may be recommended after repeated failure, undo,
rejection, stale-state conflict, or safety-gate failure.

## 19. Privacy and Security

Do not place task titles, notes, Brain Dump content, clarification text,
raw event payloads, or AI reasoning in analytics.

Requirements:

-   Cross-user execution impossible
-   Server authorization authoritative
-   Unknown rules/schema versions fail closed
-   Immutable audit records
-   Replay suppression
-   Additive/backward-compatible migrations where possible
-   Legacy records remain readable
-   Per-user/rule rate limits
-   Account deletion cancels queued work, releases locks, and
    removes/expires automation data according to policy

## 20. Reliability and Observability

Track queue depth/latency, execution latency, success/failure, retries,
dead letters, lock contention, duplicate suppression, adapter
availability, propagation depth, and event age.

Executions exhausting retry policy enter terminal/dead-letter state.
Never retry indefinitely or replay stale mutations blindly.

## 21. Feature Flags and Rollout

Support global, per-rule, per-adapter and TRUSTED-mode kill switches
plus cohort rollout.

Suggested rollout:

``` text
Stage 1: Internal testing
Stage 2: Early-access users, ASSISTED only
Stage 3: TRUSTED refresh/maintenance rules
Stage 4: Broader rollout
Stage 5: Evaluate future low-risk mutations
```

## 22. Success and Guardrail Metrics

Primary metric:

> Percentage of eligible low-risk maintenance actions completed
> automatically without failure, undo, or user correction.

Critical guardrails include unauthorized/cross-user execution,
prohibited high-impact mutation, TRUSTED execution without consent,
duplicate or stale mutation, mutable audit history, infinite propagation
loops, replay attacks, non-expiring locks, task-content telemetry
leakage, and automatic trust escalation.

Any unauthorized execution is a critical defect.

## 23. MVP Scope

Included:

-   Rule catalog
-   OFF/ASSISTED/TRUSTED model
-   Per-user policy/consent
-   Pause/resume
-   Events/trigger registry
-   Execution/audit persistence
-   Queue/locks/idempotency/retry
-   Deterministic safety pipeline
-   Existing-feature adapters
-   Cross-feature synchronization
-   Settings/history UI
-   Trust progression recommendations
-   Security/privacy hardening
-   Observability
-   Feature flags and staged rollout

Excluded:

-   Automatic hard-deadline changes
-   Automatic deletion/archive
-   External communications
-   Autonomous LLM agents
-   Automatic trust escalation
-   Unreviewed Schedule Repair/Recovery mutations
-   Calendar automation

## 24. Chapter Structure

``` text
docs/prd/trusted-automation/
├── tasklaunch-trusted-automation-prd.md
├── 01-contract-rule-catalog-events.md
├── 02-policy-consent-pause.md
├── 03-execution-audit-persistence.md
├── 04-queue-locking-idempotency-retry.md
├── 05-execution-safety-pipeline.md
├── 06-api-contracts.md
├── 07-event-dispatcher.md
├── 08-planning-adapters.md
├── 09-brain-dump-clarification-adapters.md
├── 10-repair-recovery-adapters.md
├── 11-cross-feature-synchronization.md
├── 12-settings-history-ui.md
├── 13-security-privacy-hardening.md
├── 14-trust-progression.md
├── 15-production-reliability.md
└── 16-rollout-readiness.md
```

## 25. Codex Source Precedence

For each implementation issue:

1.  GitHub issue defines the current implementation scope.
2.  Referenced chapter defines detailed behaviour.
3.  This parent PRD defines system-wide architecture, invariants, safety
    rules and non-goals.

Codex must not implement unrelated requirements belonging to later
issues. Conflicts must be surfaced rather than silently resolved.

## 26. Definition of Done

The Trusted Automation MVP is complete when:

-   Automation authority is server-controlled
-   Per-rule consent/trust works
-   Pause-all works safely
-   Unknown rules fail closed
-   Events are idempotently processed
-   Queue/locks/retries are bounded
-   Immutable audit history exists
-   Existing feature services are reused
-   Consequential Schedule Repair/Recovery changes still require
    confirmation
-   Cross-feature propagation is cycle-safe
-   Cross-user execution is prevented
-   Settings/history UI is accessible
-   Trust escalation is never automatic
-   Privacy-safe analytics are implemented
-   Operational metrics, kill switches and rollback controls exist
-   Unit, integration, security, load and E2E tests pass

## 27. Recommended Implementation Order

``` text
Contracts
→ Policy + Persistence
→ Queue + Safety Pipeline
→ APIs
→ Events
→ Feature Adapters
→ Cross-feature Synchronization
→ Settings/History UX
→ Security Hardening
→ Trust Progression
→ Production Reliability
→ Rollout Readiness
```
