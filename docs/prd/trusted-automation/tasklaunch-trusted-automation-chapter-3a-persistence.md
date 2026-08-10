
# Trusted Automation Architecture
## Chapter 3A — Persistence Architecture & Firestore Model

**Document:** TaskLaunch Trusted Automation Architecture Specification  
**Chapter:** 3A of 6  
**Section:** Persistence Architecture & Firestore Model

---

# 1. Purpose

This section defines the persistent storage architecture for the Trusted Automation platform.

The persistence layer is responsible for recording:

- Automation policy
- Automation execution
- Audit history
- Locks
- Scheduling metadata
- Feature integration references

It is **not** responsible for storing business data already owned by:

- Tasks
- Brain Dump
- Task Clarification
- Next Best Action
- Daily Executive Brief
- Adaptive Daily Capacity
- Schedule Repair
- Recovery Mode

Automation stores orchestration metadata only.

---

# 2. Architectural Principles

The persistence layer follows these principles.

1. Single source of truth.
2. No duplicated task data.
3. Append-only audit history.
4. Deterministic document ownership.
5. User-scoped collections.
6. Explicit schema versioning.
7. Backward-compatible evolution.
8. TTL for transient records.
9. Minimal personally identifiable data.
10. Server-authoritative writes.

---

# 3. Firestore Collection Hierarchy

```text
users/{uid}
│
├── automationSettings/
│     settings
│
├── automationRules/
│     {ruleId}
│
├── automationExecutions/
│     {executionId}
│
├── automationHistory/
│     {historyId}
│
├── automationLocks/
│     {lockId}
│
├── automationQueues/
│     {queueItemId}
│
└── automationMetrics/
      daily
```

Automation never owns the existing Executive Function collections.

Instead it references them.

---

# 4. Cross-Feature References

Automation references:

```text
tasks/{taskId}

taskRecommendations/{recommendationId}

dailyBriefs/{briefId}

dailyCapacity/{capacityId}

scheduleRepairs/{repairId}

recoverySessions/{recoveryId}
```

Only IDs and version hashes should be stored.

Never duplicate payloads.

---

# 5. Automation Settings Document

Path

```text
users/{uid}/automationSettings/settings
```

Example:

```json
{
  "schemaVersion": 1,
  "pauseAll": false,
  "refreshDailyBrief": true,
  "refreshNextBestAction": true,
  "refreshCapacity": true,
  "refreshScheduleRepair": true,
  "updatedAt": "timestamp"
}
```

There should be exactly one settings document per user.

---

# 6. Automation Rule Document

Path

```text
users/{uid}/automationRules/{ruleId}
```

Recommended schema:

```json
{
  "schemaVersion": 1,
  "ruleId": "refresh_daily_brief",
  "enabled": true,
  "trustLevel": "TRUSTED",
  "trigger": "DAILY_BRIEF_STALE",
  "priority": "NORMAL",
  "updatedAt": "timestamp"
}
```

Rule documents define policy only.

---

# 7. Automation Execution Document

Path

```text
users/{uid}/automationExecutions/{executionId}
```

Lifecycle:

```text
QUEUED
RUNNING
SUCCEEDED
FAILED
SKIPPED
CANCELLED
```

Example:

```json
{
  "schemaVersion": 1,
  "executionId": "...",
  "ruleId": "refresh_daily_brief",
  "entityType": "DAILY_BRIEF",
  "entityId": "brief_123",
  "state": "RUNNING",
  "idempotencyKey": "...",
  "retryCount": 0,
  "startedAt": "timestamp"
}
```

Execution documents are transient.

Recommended TTL:

```text
30 days
```

---

# 8. Automation History

History is immutable.

Path:

```text
users/{uid}/automationHistory/{historyId}
```

Example:

```json
{
  "schemaVersion": 1,
  "executionId": "...",
  "ruleId": "refresh_daily_brief",
  "trigger": "STALE",
  "outcome": "SUCCESS",
  "reasonCodes": [
    "STALE",
    "AUTO_REFRESH"
  ],
  "durationMs": 184,
  "createdAt": "timestamp"
}
```

History must never be updated after creation.

---

# 9. Automation Locks

Path

```text
users/{uid}/automationLocks/{lockId}
```

Purpose:

Prevent concurrent execution against the same entity.

Example:

```json
{
  "entityId": "brief_123",
  "ownerExecutionId": "...",
  "expiresAt": "timestamp"
}
```

Locks must use TTL.

---

# 10. Queue Documents

Queue records represent pending work.

```text
users/{uid}/automationQueues/{queueItemId}
```

Suggested fields:

- ruleId
- entityId
- priority
- queuedAt
- idempotencyKey

Queue entries are ephemeral.

---

# 11. Versioning Strategy

Every persisted document includes:

```text
schemaVersion
createdAt
updatedAt
```

Rules:

- Never remove required fields without migration.
- Ignore unknown optional fields.
- Prefer additive schema evolution.
- Legacy readers must continue functioning.

---

# 12. Migration Strategy

Future schema changes should use:

1. Additive rollout.
2. Dual-reader compatibility.
3. Background migration where required.
4. Removal only after all readers support the new schema.

Never require destructive migrations.

---

# 13. Referential Integrity

Automation references external entities.

Before execution:

- confirm referenced entity exists
- verify ownership
- verify current version
- verify entity type
- verify feature availability

Broken references should produce SKIPPED rather than FAILED where appropriate.

---

# 14. Retention Policy

Suggested defaults:

| Collection | Retention |
|---|---:|
| automationExecutions | 30 days |
| automationHistory | 90 days |
| automationLocks | 5 minutes (TTL) |
| automationQueues | 24 hours (TTL) |

Values remain configurable.

---

# 15. Firestore Security Rules

Clients may read:

- automationSettings
- automationHistory
- completed execution summaries

Clients must never write:

- execution state
- locks
- queue items
- audit records

All mutations occur through trusted server APIs.

---

# 16. Operational Requirements

The persistence layer must support:

- optimistic concurrency
- idempotency
- retry-safe writes
- server timestamps
- TTL indexes
- efficient pagination
- low-cost reads
- batch writes where appropriate

---

# 17. Codex Implementation Notes

Implement in this order:

1. Shared document interfaces
2. Firestore converters
3. Zod validation
4. Repository layer
5. Server write paths
6. Read APIs
7. TTL configuration
8. Migration tests
9. Security-rule tests

---

# 18. Acceptance Criteria

- Every collection has a single responsibility.
- Automation metadata is isolated from business entities.
- Existing Executive Function collections are referenced, not duplicated.
- Schema versioning is implemented.
- TTL strategy is documented.
- Migration path is additive.
- Security boundaries are defined.
- Retention policy is documented.
- Persistence contracts are ready for repository implementation.
