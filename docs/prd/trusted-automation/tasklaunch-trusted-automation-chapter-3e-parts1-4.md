
# Trusted Automation Architecture
## Chapter 3E — Feature Integration & Orchestration (Parts 1–4)

**Document:** TaskLaunch Trusted Automation Architecture Specification  
**Chapter:** 3E of 6  
**Scope:** Parts 1–4

---

# Part 1 — Integration Philosophy

## Purpose

Trusted Automation is an orchestration layer, not a business-logic layer.

Every Executive Function capability continues to own its own domain logic. Trusted Automation coordinates those capabilities, validates execution safety, and invokes existing service contracts.

### Core Principles

1. Single owner per business capability.
2. Automation never duplicates feature logic.
3. Integration occurs through stable service interfaces.
4. Every integration is deterministic.
5. Failures are isolated to the originating feature.
6. Orchestration must remain observable and auditable.

### Ownership Matrix

| Capability | Owning Feature |
|---|---|
| Task extraction | Brain Dump |
| Task decomposition | Task Clarification |
| Task ranking | Next Best Action |
| Daily planning | Daily Executive Brief |
| Capacity estimation | Adaptive Daily Capacity |
| Schedule adjustment | Automatic Schedule Repair |
| Backlog recovery | Recovery Mode |
| Execution orchestration | Trusted Automation |

Trusted Automation may **invoke** these services but must never reimplement their algorithms.

---

# Part 2 — Executive Function Dependency Graph

## Dependency Hierarchy

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
Adaptive Daily Capacity
      │
      ▼
Daily Executive Brief
      │
      ▼
Schedule Repair
      │
      ▼
Recovery Mode
      │
      ▼
Trusted Automation
```

### Dependency Rules

Brain Dump produces structured tasks.

Task Clarification enriches tasks.

Next Best Action ranks eligible tasks.

Adaptive Daily Capacity estimates realistic workload.

Daily Executive Brief consumes capacity and recommendations.

Schedule Repair consumes Brief + Capacity.

Recovery Mode consumes Schedule Repair, Capacity and Next Best Action.

Trusted Automation coordinates execution across all of the above.

No feature may introduce a reverse dependency.

---

# Part 3 — Event Bus & Orchestration Model

## Event Philosophy

Features communicate through domain events rather than direct knowledge of each other's internals.

### Event Lifecycle

```text
Feature
   ↓
Domain Event
   ↓
Automation Dispatcher
   ↓
Rule Evaluation
   ↓
Existing Feature Service
   ↓
Audit
```

### Canonical Events

Planning:

- DAILY_BRIEF_GENERATED
- DAILY_BRIEF_STALE
- CAPACITY_UPDATED

Recommendations:

- NEXT_BEST_ACTION_CREATED
- NEXT_BEST_ACTION_STARTED
- NEXT_BEST_ACTION_DISMISSED

Scheduling:

- SCHEDULE_REPAIR_CREATED
- SCHEDULE_REPAIR_APPLIED

Recovery:

- RECOVERY_STARTED
- RECOVERY_COMPLETED

Tasks:

- TASK_CREATED
- TASK_UPDATED
- TASK_COMPLETED
- TASK_POSTPONED

Automation:

- AUTOMATION_TRIGGERED
- AUTOMATION_COMPLETED
- AUTOMATION_FAILED

### Event Requirements

Every event must include:

- eventId
- eventType
- entityType
- entityId
- entityVersion
- userId
- timestamp
- schemaVersion

Events are immutable.

---

# Part 4 — Service Ownership Boundaries

## Brain Dump Contract

Trusted Automation may:

- regenerate processing
- expire sessions
- clean transient state

Trusted Automation must never:

- extract tasks
- classify input
- change AI prompts

## Task Clarification Contract

Automation may:

- invoke clarification
- refresh stale recommendations

Automation must never:

- rewrite decomposition logic
- modify accepted recommendations

## Next Best Action Contract

Automation may:

- regenerate recommendations
- invalidate stale recommendations

Automation must never:

- rank tasks itself
- modify ranking weights

## Adaptive Daily Capacity Contract

Automation may:

- request recalculation
- refresh snapshots

Automation must never:

- calculate capacity
- override user settings

## Daily Executive Brief Contract

Automation may:

- regenerate briefs
- expire stale briefs

Automation must never:

- calculate workload
- classify plan health

## Schedule Repair Contract

Automation may:

- regenerate proposals
- expire proposals
- invoke approved apply workflow

Automation must never:

- score repair candidates
- move tasks directly

## Recovery Mode Contract

Automation may:

- create recovery sessions
- expire stale sessions
- complete completed recoveries

Automation must never:

- classify backlog
- choose restart tasks

## Integration Guarantees

Every feature interface must provide:

- deterministic behaviour
- stable request/response contracts
- ownership validation
- version validation
- idempotent execution where applicable

No feature may call another feature's repository directly.

All cross-feature communication occurs through service interfaces and domain events.

---

# Acceptance Criteria (Parts 1–4)

- Integration philosophy is defined.
- Feature ownership is unambiguous.
- Dependency graph is acyclic.
- Domain event model is documented.
- Canonical event payload requirements are defined.
- Cross-feature service boundaries are established.
- Trusted Automation orchestrates but never duplicates business logic.
