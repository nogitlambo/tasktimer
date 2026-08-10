# TaskLaunch Automatic Schedule Repair

## Product Requirements Document

**Status:** Draft for implementation  
**Product:** TaskLaunch  
**Feature:** Automatic Schedule Repair  
**Parent capability:** Executive Function Engine  
**Preceding core features:** Intelligent Brain Dump; AI Task Clarification and Decomposition; Next Best Action; Daily Executive Brief; Adaptive Daily Capacity  
**Target platforms:** Responsive web and Android-compatible web UI  
**Primary stack:** Next.js, React, TypeScript, Firebase Authentication, Firestore, hosted server API, Zod  
**Primary objective:** Detect when the user’s current plan is no longer realistic and propose safe, explainable, reversible task or workload adjustments without applying changes automatically.

---

## 1. Product Summary

Automatic Schedule Repair helps the user recover when the day changes.

The feature should detect situations such as:

- A task runs longer than expected
- Available time drops
- The current focus window is missed
- Multiple tasks remain with insufficient capacity
- A new urgent task is added
- A deadline becomes at risk
- The user manually lowers today’s capacity
- Several planned tasks are skipped or postponed

Instead of forcing the user to manually reorganise everything, TaskLaunch should generate a small set of safe proposed adjustments.

Example:

```text
Your remaining plan is 95 minutes, but you have about 50–65 minutes of capacity left.

Suggested repair:
- Move "Research notification providers" to tomorrow
- Keep "Finish Play Store screenshots" today
- Reduce "Review onboarding copy" to a 15-minute session

[Review changes]
```

The MVP must remain advisory. No task, due date, schedule, target, or recurrence may change without explicit user confirmation.

---

## 2. Product Principle

> Repair the plan, not the user.

The feature must remain deterministic at its core, explainable, safe, reversible, user-controlled, deadline-aware, capacity-aware, nonjudgmental, and useful without AI.

---

## 3. Problem Statement

A plan may become unrealistic because one task takes longer than expected, interruptions reduce available time, the user starts later than planned, a focus period ends, urgent work appears, or capacity changes.

Without repair assistance, the user must manually recalculate remaining workload, decide what is still important, identify flexible tasks, protect deadlines, move work, reduce scope, and avoid overloading tomorrow.

TaskLaunch should reduce that executive-function burden by proposing the minimum safe repair.

---

## 4. Goals

### 4.1 Primary Goals

The feature must:

- Detect when a daily plan is no longer realistic
- Use Adaptive Daily Capacity as the authoritative remaining-capacity source
- Protect hard deadlines
- Preserve explicit user priority
- Identify flexible work
- Generate a small number of repair proposals
- Explain every proposed change with deterministic reason codes
- Allow review before applying changes
- Allow partial acceptance
- Prevent unsafe movements beyond deadlines
- Prevent tomorrow-overload cascades
- Reuse existing task persistence and scheduling logic
- Support safe undo
- Continue to work without AI

### 4.2 Secondary Goals

The feature should:

- Reduce manual rescheduling
- Reduce overloaded-day carry-over
- Improve planned-versus-completed accuracy
- Reduce repeated postponement
- Support recovery after interruptions
- Improve trust in Daily Executive Brief
- Provide a foundation for Recovery Mode
- Provide a foundation for Trusted Automation

### 4.3 Non-Goals

The MVP will not:

- Apply changes automatically
- Change hard deadlines
- Delete tasks
- Change recurring-task definitions
- Send messages
- Modify calendars
- Reprioritise tasks permanently
- Infer mood, fatigue, or burnout
- Use an LLM to decide which tasks move
- Rebuild the user’s entire week
- Optimise multi-user schedules

---

## 5. Core User Stories

### Repair an Overloaded Day

As a user whose day has become unrealistic, I want TaskLaunch to suggest what can move so I do not have to manually reorganise everything.

### Protect Important Work

As a user, I want due-soon and high-priority work protected during repair.

### Review Before Applying

As a user, I want to see every proposed change before TaskLaunch modifies my tasks.

### Accept Only Some Changes

As a user, I want to accept or reject individual repair actions.

### Avoid Tomorrow Overload

As a user, I do not want today’s excess work dumped blindly onto tomorrow.

### Undo a Repair

As a user, I want to undo recently applied repair actions where safe.

---

## 6. Trigger Conditions

Suggested triggers:

```text
PLAN_OVERLOADED
PLAN_SIGNIFICANTLY_OVERLOADED
AVAILABLE_TIME_REDUCED
CAPACITY_REDUCED
TASK_OVERRAN_ESTIMATE
FOCUS_WINDOW_MISSED
NEW_URGENT_TASK
MULTIPLE_TASKS_SKIPPED
DEADLINE_AT_RISK
MANUAL_REFRESH
```

Trigger evaluation may occur when:

- Daily Executive Brief refreshes
- A task session completes
- A task is postponed
- Available-time override changes
- Capacity override changes
- A new task is added
- User manually requests repair

The MVP should not continuously run in the background.

---

## 7. Primary User Flow

```text
Trigger occurs
    ↓
TaskLaunch recalculates plan health
    ↓
If repair threshold met:
    load remaining tasks
    ↓
load Adaptive Daily Capacity
    ↓
classify tasks by rigidity/flexibility
    ↓
protect hard constraints
    ↓
generate candidate adjustments
    ↓
score repair combinations
    ↓
select safest minimal repair set
    ↓
persist repair proposal
    ↓
show review interface
    ↓
user accepts/rejects individual actions
    ↓
validate current task versions
    ↓
apply accepted changes
    ↓
refresh Daily Executive Brief
    ↓
offer Undo
```

---

## 8. Repair Philosophy

Priority order:

1. Protect hard deadlines
2. Protect high-priority tasks
3. Protect in-progress work
4. Preserve user-pinned tasks
5. Move flexible tasks
6. Reduce optional scope
7. Avoid shifting too much work into the next day
8. Avoid unnecessary churn

The repair engine should prefer the smallest change necessary.

---

## 9. Supported Repair Actions

MVP actions:

```text
MOVE_TO_LATER_DAY
REMOVE_FROM_TODAY
REDUCE_TODAY_TARGET
KEEP_TODAY
REVIEW_DEADLINE
CLARIFY_TASK
```

No action may be applied automatically in the MVP.

---

## 10. Hard Constraints

The repair engine must never violate:

- Hard due dates
- Explicit user-pinned dates
- Existing recurrence rules
- Task ownership
- Permission restrictions
- Task completion state
- Existing scheduling exclusions
- User-defined unavailable days
- Maximum supported schedule horizon

Hard constraints must be enforced in deterministic application code.

---

## 11. Task Flexibility Classification

Each remaining task should be classified as:

```text
FIXED
LIMITED
FLEXIBLE
UNKNOWN
```

### FIXED

Examples:

- Due today
- Pinned today
- High-priority hard deadline
- In progress with strong continuation reason

### LIMITED

Examples:

- Due within 1–3 days
- Dependency-sensitive
- High explicit priority

### FLEXIBLE

Examples:

- No near-term deadline
- Not pinned
- Not blocking important work
- Existing scheduling rules allow movement

### UNKNOWN

Insufficient metadata. Unknown tasks should not be moved by default.

---

## 12. Repair Candidate Scoring

Suggested factors:

| Signal | Effect |
|---|---:|
| Flexible task | Strong candidate to move |
| No deadline | Strong candidate to move |
| Low priority | Candidate to move |
| High estimated duration | Higher relief value |
| Due within 3 days | Penalty |
| High priority | Strong penalty |
| In progress | Strong penalty |
| Pinned today | Exclude |
| Blocking other work | Strong penalty |
| Already moved recently | Penalty |
| Target day overloaded | Exclude or strong penalty |

Exact weights must be configurable.

---

## 13. Repair Objective

The engine should aim for:

```text
remainingPlannedMinutes <= remainingCapacity.max
```

Preferably:

```text
remainingPlannedMinutes <= remainingCapacity.midpoint
```

without violating hard constraints.

Stop once sufficient workload relief has been achieved.

---

## 14. Target-Day Selection

Candidate target days should consider:

- Task deadline
- Existing scheduling rules
- User productivity days
- Existing planned workload
- Adaptive capacity where available
- Unavailable-day rules
- Task recurrence restrictions

Suggested search horizon:

```text
Next 7 valid days
```

Do not simply move everything to tomorrow.

---

## 15. Future-Day Load Protection

Before proposing a move:

```text
targetDayPlanned + movedTaskDuration
```

must be checked against that day’s safe planning threshold.

If future Adaptive Daily Capacity is unavailable, use:

1. Known user schedule capacity
2. Historical weekday capacity
3. Product fallback

Do not knowingly create a new overload.

---

## 16. Reduce Today Target

A repair may propose a smaller session target when:

- The task can make meaningful partial progress
- Permanent task scope should not change
- Remaining capacity is insufficient for the full planned session
- The reduced amount remains useful

Example:

```text
Original planned session:
30 min

Suggested today:
15 min
```

This must be a day/session planning adjustment, not permanent task-duration corruption.

---

## 17. Repair Proposal Output

```json
{
  "proposalId": "repair_123",
  "planHealthBefore": "SIGNIFICANTLY_OVERLOADED",
  "remainingPlannedMinutesBefore": 110,
  "remainingCapacity": {
    "min": 50,
    "max": 65
  },
  "estimatedPlannedMinutesAfter": 60,
  "actions": [
    {
      "type": "MOVE_TO_LATER_DAY",
      "taskId": "task_a",
      "fromDate": "2026-08-08",
      "toDate": "2026-08-10",
      "reasonCodes": [
        "TASK_FLEXIBLE",
        "TODAY_OVERLOADED",
        "TARGET_DAY_HAS_ROOM"
      ]
    }
  ]
}
```

---

## 18. Stable Reason Codes

```text
TODAY_OVERLOADED
TODAY_SIGNIFICANTLY_OVERLOADED
TASK_FLEXIBLE
TASK_LOW_PRIORITY
TASK_NO_NEAR_DEADLINE
TASK_DUE_SOON
TASK_FIXED
TASK_PINNED
TASK_IN_PROGRESS
TASK_BLOCKING
TARGET_DAY_HAS_ROOM
TARGET_DAY_OVERLOADED
LIMITED_REMAINING_CAPACITY
PARTIAL_PROGRESS_USEFUL
HARD_DEADLINE_PROTECTED
CAPACITY_REDUCED
AVAILABLE_TIME_REDUCED
RECENTLY_MOVED
NO_SAFE_MOVE_AVAILABLE
```

---

## 19. Repair Proposal Data Model

Suggested path:

```text
users/{userId}/scheduleRepairs/{repairId}
```

```ts
export type ScheduleRepairStatus =
  | "ACTIVE"
  | "PARTIALLY_APPLIED"
  | "APPLIED"
  | "DISMISSED"
  | "EXPIRED"
  | "REVERSED";

export interface ScheduleRepairProposal {
  id: string;
  userId: string;
  localDate: string;

  planHealthBefore: string;
  remainingPlannedMinutesBefore: number;

  remainingCapacity: {
    min: number;
    max: number;
  };

  estimatedPlannedMinutesAfter: number;
  actions: ScheduleRepairAction[];

  sourceTaskVersionHash: string;
  capacitySnapshotId?: string | null;
  dailyBriefId?: string | null;

  status: ScheduleRepairStatus;
  createdAt: string;
  expiresAt: string;
  appliedAt?: string | null;
}
```

---

## 20. Repair Action Model

```ts
export interface ScheduleRepairAction {
  id: string;

  type:
    | "MOVE_TO_LATER_DAY"
    | "REMOVE_FROM_TODAY"
    | "REDUCE_TODAY_TARGET"
    | "KEEP_TODAY"
    | "REVIEW_DEADLINE"
    | "CLARIFY_TASK";

  taskId: string;
  taskVersion: string;

  fromDate?: string | null;
  toDate?: string | null;

  fromMinutes?: number | null;
  toMinutes?: number | null;

  reasonCodes: string[];
  selected: boolean;

  status:
    | "PROPOSED"
    | "APPLIED"
    | "REJECTED"
    | "FAILED"
    | "REVERSED";
}
```

---

## 21. Proposal Expiry

Suggested expiry:

```text
15 minutes
```

Expire earlier if referenced task state, capacity, or availability changes materially.

Do not apply stale proposals.

---

## 22. Stale-State Protection

Before apply:

- Re-read referenced tasks
- Compare task versions
- Re-read capacity
- Recheck target-day eligibility
- Recheck hard deadlines
- Recheck target-day load

If stale:

```text
Your plan changed after this repair was prepared. TaskLaunch has refreshed the suggestions.
```

---

## 23. Review Interface

```text
REPAIR TODAY'S PLAN

You have about 110 minutes left to do,
but around 50–65 minutes of capacity remains.

Suggested changes

☑ Move "Research notification providers"
   Today → Monday
   Flexible task; Monday has room.

☑ Reduce "Review onboarding copy"
   30 min → 15 min today

After changes:
About 60 minutes planned

[Apply selected changes]
[Keep current plan]
```

---

## 24. Review Controls

The user must be able to:

- Select or deselect each action
- Inspect reasons
- Change proposed target date where supported
- Edit proposed reduced target
- Keep a task today
- Reject the full repair
- Refresh proposal
- Apply selected actions

No changes occur before confirmation.

---

## 25. Apply Semantics

On apply:

1. Authenticate user
2. Verify proposal ownership
3. Verify freshness
4. Revalidate task versions
5. Revalidate hard constraints
6. Revalidate target-day load
7. Apply accepted actions through existing services
8. Record before/after values
9. Update proposal status
10. Refresh Daily Executive Brief
11. Refresh Next Best Action
12. Offer Undo

Use atomic writes where technically supported.

---

## 26. Partial Acceptance

After partial selection, recalculate the expected remaining workload.

If still overloaded:

```text
Your selected changes reduce today to 80 minutes.
That is still above the estimated 50–65 minute range.
```

Allow the user to continue anyway.

---

## 27. Undo

Recommended undo window:

```text
30 seconds
```

Undo may restore:

- Original schedule date
- Original today-only target
- Original today inclusion state

Undo must not overwrite later user changes.

---

## 28. Daily Executive Brief Integration

Daily Executive Brief should surface:

```text
Repair today's plan
```

when the day is overloaded and at least one safe repair exists.

The brief should not maintain separate repair logic after this feature becomes authoritative.

---

## 29. Adaptive Daily Capacity Integration

Schedule Repair must use Adaptive Daily Capacity as the authoritative remaining-capacity source.

Consume:

```text
remainingRange
state
confidence
manualOverride
```

If unavailable, use the existing Daily Executive Brief fallback.

---

## 30. Next Best Action Integration

After a repair applies:

- Invalidate any affected recommendation
- Regenerate Next Best Action
- Do not reuse a recommendation for a task moved out of today

Schedule Repair must not independently rank the next task.

---

## 31. Task Clarification Integration

If a required task cannot safely move but is too large for the remaining window, Schedule Repair may propose:

```text
CLARIFY_TASK
```

Use the existing Task Clarification flow.

---

## 32. AI Role

AI may optionally rephrase structured repair reasons.

AI must not:

- Select tasks to move
- Select target dates
- Override deadlines
- Change scores
- Invent task flexibility
- Invent capacity
- Apply changes

Core repair logic must remain deterministic.

---

## 33. API Contracts

### Generate Repair

```http
POST /api/executive-function/schedule-repair
```

### Refresh Repair

```http
POST /api/executive-function/schedule-repair/{repairId}/refresh
```

### Apply Repair

```http
POST /api/executive-function/schedule-repair/{repairId}/apply
```

Request:

```json
{
  "actions": [
    {
      "actionId": "action_1",
      "selected": true
    }
  ],
  "idempotencyKey": "uuid"
}
```

### Dismiss Repair

```http
POST /api/executive-function/schedule-repair/{repairId}/dismiss
```

### Undo Repair

```http
POST /api/executive-function/schedule-repair/{repairId}/undo
```

---

## 34. Idempotency

Repeated apply requests with the same key must:

- Return the original result
- Not move tasks twice
- Not duplicate audit records
- Not duplicate target changes

---

## 35. Ownership and Security

Requirements:

- Repairs are user-scoped
- Server loads task state directly
- Client does not supply trusted current task values
- Every referenced task must be owned or editable by the user
- Shared-task restrictions are respected
- Cross-user data is never exposed

---

## 36. Privacy

Prefer storing:

- Task IDs
- Dates
- Minutes
- Reason codes
- State transitions
- Before/after structured values

Avoid storing:

- Task notes
- Brain Dump source
- Clarification source text
- AI reasoning
- Unrelated task content

Analytics must not include task titles.

---

## 37. Analytics Events

```text
schedule_repair_triggered
schedule_repair_generated
schedule_repair_viewed
schedule_repair_action_selected
schedule_repair_action_rejected
schedule_repair_applied
schedule_repair_partially_applied
schedule_repair_dismissed
schedule_repair_refreshed
schedule_repair_stale
schedule_repair_undone
schedule_repair_no_safe_solution
schedule_repair_failed
```

---

## 38. Success Metrics

Primary metric:

> Percentage of repair proposals that reduce remaining planned workload into the current capacity range without violating hard constraints.

Supporting metrics:

- Repair acceptance rate
- Partial acceptance rate
- Dismissal rate
- Undo rate
- Average minutes removed from overloaded days
- Reduction in manual rescheduling
- Reduction in next-day overload caused by carry-over
- Post-repair task start rate
- Post-repair plan-health improvement

---

## 39. Guardrail Metrics

Monitor:

- Tasks moved beyond deadlines
- Pinned tasks moved
- High-priority fixed tasks moved
- Future-day overload created
- Duplicate moves
- Stale proposals applied
- Cross-user task exposure
- Permanent duration changed by a today-only reduction
- Undo overwriting later user changes

Any hard-deadline violation is a critical defect.

---

## 40. Failure Handling

### No Safe Repair

```text
TaskLaunch couldn't find a safe way to reduce today's plan without affecting important work.
```

### Repair Failure

```text
TaskLaunch couldn't prepare a repair right now. Your current plan has not changed.
```

### Apply Failure

- Preserve unapplied actions
- Return exact failures
- Prevent duplicate retries
- Refresh stale state if necessary

---

## 41. Performance Targets

| Operation | Target |
|---|---:|
| Candidate classification | Under 300 ms |
| Repair calculation | Under 500 ms |
| Target-day search | Under 500 ms |
| Full proposal response | Under 1 second |
| Apply repair | Under 2 seconds |
| Undo | Under 1 second |

No AI call is required for core repair generation.

---

## 42. Accessibility Requirements

The interface must support:

- Keyboard navigation
- Screen readers
- Clear before/after values
- Large selection controls
- No colour-only safety indication
- Accessible date editing
- Clear stale-state announcements
- Clear success/failure announcements
- Reduced motion

---

## 43. MVP Scope

### Included

- Deterministic repair triggers
- Overload repair
- Task flexibility classification
- Hard constraint protection
- Candidate scoring
- Move-to-later-day proposal
- Remove-from-today proposal
- Reduce-today-target proposal
- Deadline-review proposal
- Clarification handoff
- Future-day load protection
- Review UI
- Partial acceptance
- Stale-state checks
- Idempotent apply
- Safe undo
- Daily Brief integration
- Adaptive Capacity integration
- Next Best Action invalidation
- Analytics
- Unit, integration, and E2E tests

### Excluded

- Automatic application
- Trusted Automation
- Calendar moves
- Multi-week optimisation
- Recurrence editing
- Deadline changes
- AI-selected repair actions
- Push notification repair prompts
- Collaborative scheduling

---

## 44. Phase Two Scope

Phase Two may introduce:

- Trusted low-risk automatic repair
- User-defined automation permissions
- Multi-day rebalancing
- Calendar-aware repair
- Automatic quiet-day protection
- Repeated-postponement policies
- Recovery Mode integration
- Weekly capacity balancing

---

## 45. Ordered Build Plan

### Phase 1: Repair Contract and Eligibility

1. Inspect current scheduling and task-date model
2. Define repair action enums
3. Define flexibility classification
4. Define hard constraints
5. Define trigger codes
6. Define reason codes
7. Define proposal schema
8. Add deterministic eligibility tests

### Phase 2: Repair Engine

1. Load Adaptive Daily Capacity
2. Calculate remaining planned workload
3. Generate repair candidates
4. Score candidates
5. Stop when enough relief is achieved
6. Implement target-day search
7. Protect future-day load
8. Implement no-safe-solution state
9. Add deterministic fixture tests

### Phase 3: Persistence and API

1. Add user-scoped repair records
2. Add generation endpoint
3. Add expiry
4. Add source-version hash
5. Add refresh
6. Add ownership checks
7. Add API tests

### Phase 4: Review and Apply

1. Build repair review UI
2. Add selection controls
3. Add target editing
4. Add partial apply
5. Add idempotency
6. Add stale checks
7. Add audit records
8. Add Undo

### Phase 5: Integration and Hardening

1. Integrate Daily Executive Brief
2. Integrate Task Clarification handoff
3. Invalidate Next Best Action after apply
4. Refresh dependent views
5. Add privacy-safe analytics
6. Add accessibility tests
7. Add cross-user tests
8. Add stale-state E2E tests
9. Add performance tests
10. Add guardrail metrics

---

## 46. Testing Requirements

### Unit Tests

Cover:

- Trigger detection
- Flexibility classification
- Hard constraints
- Candidate scoring
- Workload relief calculation
- Target-day selection
- Future-day load protection
- Today-target reduction
- Reason codes
- No-safe-solution

### Integration Tests

Cover:

- Capacity integration
- Daily Brief integration
- Owned task loading
- Repair persistence
- Expiry
- Stale proposal detection
- Idempotent apply
- Partial apply
- Next Best Action invalidation
- Undo

### End-to-End Tests

1. Overloaded day produces repair
2. Realistic day does not
3. Flexible task is proposed for move
4. Hard-deadline task is protected
5. Tomorrow overload prevents move
6. User accepts only one action
7. Plan-remains-overloaded warning appears
8. Applied repair refreshes Daily Brief
9. Next Best Action refreshes
10. Undo restores safe values

---

## 47. Deterministic Evaluation Fixtures

Create at least 100 repair scenarios covering:

- Slight overload
- Severe overload
- Due-today tasks
- Pinned tasks
- Flexible tasks
- Unknown flexibility
- High-priority work
- Multiple future days
- Tomorrow overloaded
- No safe target day
- Reduced capacity
- Missed focus window
- New urgent task
- Partial progress targets
- Multiple skipped tasks

Validate:

- Hard constraints never violated
- Minimal sufficient repair chosen
- Future overload not created
- Stable reason codes
- Stable target selection
- No unnecessary moves

---

## 48. Recommended Product Copy

### Entry Action

```text
Repair today's plan
```

### Heading

```text
Your plan needs an adjustment
```

### Supporting Copy

```text
There is more work left than comfortably fits today. TaskLaunch can suggest a few safe changes.
```

### Apply

```text
Apply selected changes
```

### Keep Plan

```text
Keep current plan
```

### No Safe Repair

```text
There isn't a safe adjustment to suggest.
```

### Undo

```text
Undo repair
```

---

## 49. Codex Implementation Rules

1. Inspect existing scheduling, task-date, Daily Brief, Adaptive Capacity, Next Best Action, and Task Clarification code before implementation.
2. Reuse existing task and schedule persistence paths.
3. Keep repair generation deterministic.
4. Do not use AI to select tasks, dates, or reductions.
5. Protect hard deadlines before scoring candidates.
6. Keep repair weights configurable.
7. Prefer the minimum sufficient repair.
8. Never move a task solely because it is difficult.
9. Never overload a future day knowingly.
10. Do not permanently change task duration for today-only reductions.
11. Add stale-state validation before apply.
12. Use idempotency for apply.
13. Do not expose task content in analytics.
14. Add one failing public-interface test before each behaviour.
15. Mock only external boundaries such as Firebase, time, and network.
16. Do not implement Trusted Automation yet.
17. Document deviations from this PRD.

---

## 50. Definition of Done

The MVP is complete when:

- Overloaded plans are detected
- Adaptive Daily Capacity is used
- Flexible tasks are classified safely
- Hard deadlines are protected
- Safe move candidates can be proposed
- Future-day overload is prevented
- Today-only target reduction is supported
- Repair proposals are reviewable
- Partial acceptance works
- No change occurs without confirmation
- Apply is idempotent
- Stale proposals cannot apply
- Undo works safely
- Daily Executive Brief refreshes
- Next Best Action refreshes
- Cross-user access is prevented
- Analytics exclude task content
- Unit, integration, fixture, and E2E tests pass

---

## 51. Recommended First Codex Task

```text
Build the TaskLaunch Schedule Repair contract and deterministic eligibility foundation.

Requirements:
- Inspect existing task scheduling, due-date, recurrence, Daily Executive Brief, Adaptive Daily Capacity, and Next Best Action implementations.
- Define schedule repair trigger codes.
- Define repair action types.
- Define task flexibility states.
- Define hard scheduling constraints.
- Define stable reason codes.
- Define proposal and action schemas.
- Implement deterministic task flexibility classification.
- Implement hard-constraint checks.
- Do not generate repair proposals yet.
- Do not build UI.
- Do not modify tasks.
- Do not use AI.
- Add unit tests for classification, pinned tasks, deadlines, in-progress tasks, blocked work, and unknown flexibility.
- Follow incremental TDD.
```
