
# Trusted Automation Architecture
## Chapter 3C — API Contracts & Execution Lifecycle

**Document:** TaskLaunch Trusted Automation Architecture Specification  
**Chapter:** 3C of 6

---

# 1. Purpose

This chapter specifies the external and internal API contracts used by Trusted Automation, the lifecycle of an automation request, state transitions, execution guarantees, and service orchestration.

The API layer is responsible for exposing deterministic automation capabilities while ensuring validation, authorization, idempotency, and auditability.

---

# 2. API Design Principles

- Server authoritative
- Stateless endpoints
- Idempotent writes
- Explicit versioning
- Backward compatible request evolution
- Consistent error model
- Stable response envelopes
- No business logic in controllers

---

# 3. Standard Response Envelope

Every endpoint returns:

```json
{
  "success": true,
  "requestId": "...",
  "timestamp": "...",
  "data": {}
}
```

Errors:

```json
{
  "success": false,
  "requestId": "...",
  "error": {
    "code": "RULE_DISABLED",
    "message": "Automation rule is disabled."
  }
}
```

---

# 4. Execution Lifecycle

```text
Client
  ↓
Authentication
  ↓
Request Validation
  ↓
Business Validation
  ↓
Idempotency Check
  ↓
Lock Acquisition
  ↓
Automation Execution
  ↓
Audit Persistence
  ↓
Response
```

Every stage is mandatory.

---

# 5. Core Endpoints

## Read Settings

```http
GET /api/automation/settings
```

Returns effective automation configuration.

## Update Settings

```http
PUT /api/automation/settings
```

Allows enabling or disabling supported rules.

## Execute Rule

```http
POST /api/automation/execute
```

Triggers one automation rule.

Request:

```json
{
  "ruleId":"refresh_daily_brief",
  "entityId":"brief_123",
  "entityVersion":"v42",
  "idempotencyKey":"uuid"
}
```

---

# 6. Refresh Execution

```http
POST /api/automation/retry
```

Retries eligible transient failures only.

---

# 7. History

```http
GET /api/automation/history
```

Supports:

- paging
- filtering
- date ranges
- outcome filtering

---

# 8. State Machine

```text
QUEUED
   ↓
RUNNING
 ├────►SUCCEEDED
 ├────►FAILED
 ├────►SKIPPED
 └────►CANCELLED
```

Terminal states are immutable.

---

# 9. Validation Pipeline

Every execution validates:

1. Authenticated user
2. Rule enabled
3. Trust level
4. Ownership
5. Entity version
6. Lock availability
7. Business constraints
8. Idempotency

Failure aborts execution.

---

# 10. Idempotency

The server stores an execution keyed by:

```text
(ruleId, entityId, idempotencyKey)
```

Duplicate requests return the original response.

---

# 11. Lock Lifecycle

Acquire:

```text
Before execution
```

Release:

```text
After terminal state
```

Expired locks are ignored.

---

# 12. Retry Rules

Retry only:

- network failures
- temporary dependency failures
- transient datastore failures

Never retry:

- validation failures
- authorization failures
- stale entity failures

---

# 13. Execution Events

Lifecycle events:

```text
QUEUED
STARTED
VALIDATED
EXECUTED
AUDITED
COMPLETED
FAILED
```

Events are append-only.

---

# 14. OpenAPI Guidance

Each endpoint should define:

- request schema
- response schema
- error schema
- examples
- security
- idempotency requirements

Maintain OpenAPI 3.1 compatibility.

---

# 15. Feature Service Integration

Trusted Automation invokes existing services only.

Never duplicate:

- Next Best Action
- Daily Executive Brief
- Adaptive Capacity
- Schedule Repair
- Recovery Mode
- Task Clarification

---

# 16. Failure Behaviour

On failure:

- preserve existing state
- record audit
- release locks
- return deterministic error
- never leave partial execution without audit

---

# 17. Testing

Unit:

- endpoint validation
- response envelopes
- idempotency
- lifecycle transitions

Integration:

- authentication
- locking
- repository writes
- audit creation

E2E:

- execute rule
- duplicate request
- retry transient failure
- stale entity rejection

---

# 18. Codex Guidance

Implement in order:

1. DTOs
2. Controllers
3. Validation middleware
4. Services
5. Locking
6. Audit
7. Retry
8. OpenAPI documentation
9. Integration tests

---

# 19. Acceptance Criteria

- Stable REST contracts
- Deterministic lifecycle
- Idempotent execution
- Locking defined
- Retry policy documented
- OpenAPI-ready schemas
- Existing feature services reused
- Complete testing strategy
