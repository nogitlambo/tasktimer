
# Trusted Automation Architecture
## Chapter 2 — Rule Engine and Execution Pipeline

**Document:** TaskLaunch Trusted Automation Architecture Specification  
**Chapter:** 2 of 6

---

# 1. Purpose

This chapter defines how automation rules are evaluated, validated, scheduled, executed, retried, audited, and completed.

Trusted Automation never contains feature-specific business logic. It orchestrates existing Executive Function services.

---

# 2. Core Responsibilities

The rule engine is responsible for:

- Detecting triggers
- Loading required context
- Evaluating rule preconditions
- Preventing duplicate execution
- Validating permissions
- Calling existing services
- Recording outcomes
- Producing audit records

It is not responsible for:

- Ranking tasks
- Calculating capacity
- Choosing schedule repairs
- Performing task clarification

---

# 3. Execution Pipeline

```text
Trigger
   ↓
Load Context
   ↓
Rule Selection
   ↓
Eligibility Checks
   ↓
Permission Checks
   ↓
Safety Validation
   ↓
Idempotency Check
   ↓
Execution
   ↓
Audit
   ↓
Completion
```

Failure at any stage aborts execution.

---

# 4. Rule Model

Every rule consists of:

- Rule identifier
- Trigger
- Preconditions
- Validation
- Action
- Rollback policy
- Retry policy
- Audit metadata

Example:

```ts
interface AutomationRule {
  id: string;
  trigger: string;
  enabled: boolean;
  trustLevel: "ASSISTED" | "TRUSTED";
  evaluate(ctx: AutomationContext): boolean;
  execute(ctx: AutomationContext): Promise<void>;
}
```

---

# 5. Trigger Types

Supported trigger classes:

```text
TIME
EVENT
USER
SYSTEM
```

Examples:

- Daily brief expired
- Task completed
- Capacity changed
- User requested refresh
- Recovery completed

---

# 6. Execution Queue

Automation requests are placed into a deterministic queue.

Requirements:

- FIFO within priority
- One execution per rule/entity
- Idempotent processing
- Cancellation when stale

---

# 7. Priority Levels

```text
CRITICAL
HIGH
NORMAL
LOW
```

Suggested usage:

- Ownership/security fixes → CRITICAL
- Daily Brief refresh → NORMAL
- Recommendation expiry cleanup → LOW

---

# 8. Concurrency

Rules affecting the same entity must never execute concurrently.

Acquire entity-level locks before execution.

Locks expire automatically after timeout.

---

# 9. Idempotency

Every execution requires an idempotency key.

Repeated requests with the same key must return the original outcome.

Never execute the same automation twice.

---

# 10. Retry Policy

Retries only for transient failures.

Suggested policy:

- Maximum retries: 2
- Exponential backoff
- Never retry validation failures
- Never retry authorization failures

---

# 11. Rollback

Rules define rollback capability.

Categories:

- No rollback required
- Logical rollback
- Compensating action

Example:

Refreshing Daily Executive Brief:
- No rollback

Applying Schedule Repair:
- Compensating undo action

---

# 12. Conflict Resolution

If two rules affect the same entity:

Priority order:

1. Security
2. Explicit user action
3. Recovery Mode
4. Schedule Repair
5. Daily Brief
6. Refresh rules

Lower-priority automation is cancelled.

---

# 13. State Machine

```text
Queued
   ↓
Running
   ↓
Succeeded
Failed
Skipped
Cancelled
```

Only terminal states may be audited as complete.

---

# 14. Timeouts

Every automation has:

- Queue timeout
- Execution timeout
- Lock timeout

Timeouts must be configurable.

---

# 15. Observability

Record:

- Start time
- End time
- Duration
- Outcome
- Rule id
- Entity id
- Retry count
- Failure category

Never record task content.

---

# 16. Error Categories

```text
VALIDATION
AUTHORIZATION
CONFLICT
TIMEOUT
DEPENDENCY
TRANSIENT
UNKNOWN
```

---

# 17. Extensibility

Adding a new automation should require:

1. Rule definition
2. Trigger registration
3. Tests

No engine modification.

---

# 18. Performance Targets

| Operation | Target |
|---|---:|
| Rule evaluation | <10 ms |
| Queue insertion | <5 ms |
| Lock acquisition | <20 ms |
| Dispatch | <50 ms |

---

# 19. Testing

Unit:

- Rule evaluation
- Queue ordering
- Locking
- Retry logic
- Idempotency
- Conflict resolution

Integration:

- Existing Executive Function service invocation
- Audit creation
- Failure handling

E2E:

- Trigger to completion
- Duplicate trigger suppression
- Stale cancellation
- Retry success

---

# 20. Chapter Exit Criteria

Complete when:

- Execution pipeline is fixed
- Rule contract defined
- Queue model defined
- Retry policy defined
- Rollback model defined
- Conflict resolution defined
- State machine documented
- Testing strategy established
