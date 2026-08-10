
# Trusted Automation Architecture
## Chapter 1 — Vision, Principles, Trust Model and System Architecture

**Document:** TaskLaunch Trusted Automation Architecture Specification  
**Chapter:** 1 of 6  
**Status:** Draft  
**Audience:** Product, Architecture, Engineering, QA, Codex

---

# 1. Purpose

Trusted Automation is the execution layer of the TaskLaunch Executive Function Engine.

Earlier Executive Function capabilities are advisory:

- Brain Dump captures information.
- Task Clarification makes work easier to begin.
- Next Best Action recommends what to do.
- Daily Executive Brief summarises the day.
- Adaptive Daily Capacity estimates realistic workload.
- Schedule Repair proposes changes.
- Recovery Mode proposes restart strategies.

Trusted Automation is the first component capable of executing approved actions on the user's behalf.

Its responsibility is **not** to make better decisions than the user.

Its responsibility is to perform **previously trusted, low-risk decisions consistently, safely, and transparently.**

---

# 2. Vision

TaskLaunch should gradually reduce repetitive planning work while preserving user trust.

The long-term vision is:

```text
Capture
    ↓
Understand
    ↓
Recommend
    ↓
Learn user preferences
    ↓
Earn trust
    ↓
Automate safe actions
```

Automation is therefore the final stage of capability—not the starting point.

---

# 3. Design Philosophy

Trusted Automation follows five principles.

## 3.1 Consent Before Automation

No automation may execute until the user has explicitly enabled it.

Automation is always opt-in.

---

## 3.2 Trust Is Earned

TaskLaunch should never assume permission.

Instead:

1. Recommend repeatedly
2. Observe acceptance
3. Explain behaviour
4. Allow review
5. Allow opt-in automation

Automation expands only after demonstrated user trust.

---

## 3.3 Lowest Risk First

Automation authority increases gradually.

Order of progression:

```text
Recommendations
        ↓
One-tap confirmation
        ↓
Assisted automation
        ↓
Trusted automation
        ↓
Future autonomous workflows
```

---

## 3.4 Explain Everything

Every automated action must answer:

- What happened?
- Why?
- Which rule triggered it?
- What changed?
- Can I undo it?

No hidden automation.

---

## 3.5 Human Authority Wins

User intent always overrides automation.

Manual changes immediately invalidate conflicting automation.

---

# 4. Scope

Trusted Automation controls execution.

It does **not** own:

- Task ranking
- Capacity calculation
- Clarification
- Scheduling logic
- AI reasoning

Those remain owned by existing Executive Function services.

Automation simply invokes them safely.

---

# 5. System Context

```text
Brain Dump
        │
        ▼
Task Clarification
        │
        ▼
Next Best Action
        │
        ▼
Daily Executive Brief
        │
        ▼
Adaptive Daily Capacity
        │
        ▼
Schedule Repair
        │
        ▼
Recovery Mode
        │
        ▼
Trusted Automation
        │
        ▼
TaskLaunch Persistence
```

Automation consumes outputs from existing services.

It does not replace them.

---

# 6. Automation Boundaries

Trusted Automation MAY:

- refresh recommendations
- regenerate summaries
- regenerate capacity snapshots
- expire stale recommendation records
- refresh Daily Executive Brief
- refresh Next Best Action
- refresh Schedule Repair proposals

Trusted Automation MUST NOT (MVP):

- delete tasks
- move tasks automatically
- modify deadlines
- change recurring schedules
- reprioritise tasks
- create tasks autonomously

---

# 7. Trust Levels

## OFF

Recommendations only.

No automated execution.

---

## ASSISTED

TaskLaunch prepares an action.

User confirms once.

---

## TRUSTED

Previously approved low-risk actions execute automatically.

Every execution is logged.

---

## Future: AUTONOMOUS

Reserved for later releases.

Not part of MVP.

---

# 8. Automation Categories

## Category A — Refresh

Safe regeneration.

Examples:

- Daily Executive Brief
- Next Best Action
- Capacity snapshot

Low risk.

---

## Category B — State Maintenance

Internal maintenance.

Examples:

- expire recommendations
- cleanup stale sessions
- regenerate derived data

Very low risk.

---

## Category C — Guided Execution

Requires explicit confirmation.

Examples:

- apply schedule repair
- apply recovery plan

Medium risk.

---

## Category D — High Impact

Never automated in MVP.

Examples:

- move tasks
- modify deadlines
- archive tasks
- delete tasks

---

# 9. Safety Model

Every automation passes through identical stages.

```text
Trigger
    ↓
Eligibility
    ↓
Permission
    ↓
Validation
    ↓
Execution
    ↓
Audit
    ↓
Completion
```

Failure at any stage aborts execution.

---

# 10. Safety Gates

Every rule must validate:

- authenticated user
- ownership
- latest entity version
- feature enabled
- trust level sufficient
- rule enabled
- no conflicting execution
- idempotency
- safety constraints

---

# 11. Architectural Responsibilities

Trusted Automation owns:

- rule engine
- execution orchestration
- audit logging
- permissions
- trust levels
- execution history
- retries
- rollback hooks

Existing services continue owning business logic.

---

# 12. High-Level Components

```text
Automation Trigger Manager
        │
        ▼
Rule Engine
        │
        ▼
Permission Engine
        │
        ▼
Safety Validator
        │
        ▼
Execution Orchestrator
        │
        ▼
Existing Executive Function Services
        │
        ▼
Audit Logger
```

---

# 13. Architectural Constraints

The implementation must satisfy:

- deterministic execution
- no browser AI calls
- server-authoritative validation
- idempotent execution
- observable behaviour
- auditability
- feature isolation
- backward compatibility

---

# 14. Guiding Engineering Rules

1. Never duplicate existing Executive Function logic.
2. Invoke existing services through stable interfaces.
3. Never bypass validation.
4. Never mutate user data without passing safety gates.
5. Every automation is individually disableable.
6. Every automation produces an audit record.
7. AI never decides whether automation should execute.
8. AI may only improve explanation text.

---

# 15. Chapter Exit Criteria

The architecture defined in this chapter is complete when:

- system responsibilities are clearly separated
- automation authority boundaries are defined
- trust progression is specified
- execution philosophy is documented
- component responsibilities are established
- safety principles are fixed
- future chapters can define implementation without changing these architectural principles.
