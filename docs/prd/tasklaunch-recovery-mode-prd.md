# TaskLaunch Recovery Mode

## Product Requirements Document

**Status:** Draft for implementation  
**Product:** TaskLaunch  
**Feature:** Recovery Mode  
**Parent capability:** Executive Function Engine  
**Preceding core features:** Intelligent Brain Dump; AI Task Clarification and Decomposition; Next Best Action; Daily Executive Brief; Adaptive Daily Capacity; Automatic Schedule Repair  
**Target platforms:** Responsive web and Android-compatible web UI  
**Primary stack:** Next.js, React, TypeScript, Firebase Authentication, Firestore, hosted server API, Zod  
**Primary objective:** Help users restart after missed days, accumulated backlog, or disrupted plans by triaging urgency, reducing visible cognitive load, and creating a small, realistic restart plan.

---

## 1. Product Summary

Recovery Mode helps the user resume TaskLaunch after a period where their task plan has become stale, overloaded, or difficult to re-enter.

Typical situations include:

- The user has not opened TaskLaunch for several days
- Multiple scheduled days were missed
- A large number of overdue or carried-over tasks has accumulated
- Several Daily Executive Briefs were missed
- Schedule Repair was repeatedly declined or became stale
- The current backlog materially exceeds Adaptive Daily Capacity
- The user manually chooses to reset and recover

Recovery Mode should:

- Identify genuinely urgent work
- Separate urgent work from flexible backlog
- Reduce the number of tasks shown at once
- Recommend one small restart action
- Offer safe bulk rescheduling or deferral proposals
- Preserve important deadlines
- Reuse existing Next Best Action, Adaptive Daily Capacity, Task Clarification, and Schedule Repair services
- Avoid punitive language or streak-loss framing

The MVP remains advisory. Nothing should be deleted, moved, archived, or rescheduled without explicit confirmation.

---

## 2. Product Principle

> Restart from where you are, not from where the plan says you should be.

Recovery Mode must be calm, nonjudgmental, minimal, explainable, deadline-aware, capacity-aware, user-controlled, reversible, deterministic at its core, and useful without AI.

---

## 3. Problem Statement

When users miss several planned days, traditional task managers often create a backlog that becomes harder to interpret than the original plan.

The user may face:

- Many overdue tasks
- Repeated carry-over
- Lost context
- Unclear urgency
- Multiple stale recommendations
- A schedule that no longer reflects reality
- Too many visible tasks
- Avoidance triggered by accumulated missed work

TaskLaunch should make returning easier by reducing the amount the user must process immediately.

---

## 4. Goals

### Primary Goals

The feature must:

- Detect when a user may benefit from recovery
- Allow manual activation at any time
- Identify urgent and time-sensitive tasks
- Separate flexible backlog from urgent work
- Preserve hard deadlines
- Calculate how much backlog can realistically be addressed
- Surface one restart task or first action
- Limit the number of tasks shown during recovery
- Offer safe bulk deferral or rescheduling proposals
- Allow partial acceptance
- Reuse Schedule Repair for scheduling changes where appropriate
- Reuse Task Clarification for vague restart-critical tasks
- Support safe undo
- Never delete tasks automatically

### Secondary Goals

The feature should:

- Reduce abandonment after missed days
- Reduce backlog-induced avoidance
- Improve return-to-task rate
- Improve completion of urgent work
- Reduce repeated manual rescheduling
- Improve retention after disrupted periods
- Provide a foundation for Trusted Automation
- Provide a foundation for proactive return notifications

### Non-Goals

The MVP will not:

- Diagnose burnout, depression, or any mental-health state
- Automatically delete or archive tasks
- Automatically reschedule the entire backlog
- Rewrite deadlines
- Change recurring rules
- Send external messages
- Generate long recovery coaching conversations
- Use device-activity monitoring
- Use calendar integrations
- Apply changes without confirmation

---

## 5. Core User Stories

- **Return After Missing Days:** As a user returning after several missed days, I want TaskLaunch to show me only what matters first so I am not confronted with the full backlog.
- **Protect Urgent Work:** As a user, I want deadlines and genuinely urgent tasks protected during recovery.
- **Start Small:** As a user, I want one achievable restart action so I can regain momentum without reorganising everything.
- **Defer Flexible Backlog:** As a user, I want TaskLaunch to suggest which flexible tasks can move later.
- **Review in Batches:** As a user with a large backlog, I want to review tasks gradually instead of resolving everything at once.
- **Recover Manually:** As a user, I want to activate Recovery Mode even if TaskLaunch did not detect it automatically.

---

## 6. Recovery Entry Conditions

Recovery Mode may be offered when one or more deterministic conditions are met.

```text
INACTIVE_MULTIPLE_DAYS
BACKLOG_THRESHOLD_EXCEEDED
OVERDUE_TASK_THRESHOLD_EXCEEDED
MULTIPLE_MISSED_SCHEDULED_DAYS
REPEATED_PLAN_OVERLOAD
REPEATED_REPAIR_DISMISSAL
CAPACITY_BACKLOG_MISMATCH
USER_REQUESTED_RECOVERY
```

Suggested configurable initial thresholds:

```text
Inactive:
3+ local days without meaningful TaskLaunch activity

Backlog:
8+ actionable carried-over tasks

Overdue:
4+ overdue tasks

Missed schedule:
3+ planned days with no tracked work

Capacity mismatch:
backlog estimated duration > 3x current daily capacity max
```

A trigger should offer Recovery Mode, not force it.

---

## 7. Primary User Flow

```text
Recovery condition detected
    ↓
TaskLaunch offers Recovery Mode
    ↓
User opens Recovery Mode
    ↓
Load active backlog
    ↓
Classify urgency and flexibility
    ↓
Protect hard constraints
    ↓
Calculate current capacity
    ↓
Identify restart candidate
    ↓
Group remaining backlog
    ↓
Generate recovery proposal
    ↓
Display compact recovery view
    ↓
User may:
    Start restart task
    Review urgent tasks
    Defer flexible tasks
    Clarify vague tasks
    Keep current schedule
    Exit recovery
    ↓
Apply approved changes
    ↓
Refresh Daily Executive Brief and Next Best Action
```

---

## 8. Recovery Stages

### Stage 1: What Matters Now

Show:

- Urgent tasks
- Due-today tasks
- Deadline-at-risk tasks
- One recommended restart action

### Stage 2: What Can Wait

Show:

- Flexible backlog
- Suggested deferrals
- Optional batch rescheduling

### Stage 3: Restart Plan

Show:

- Today’s reduced plan
- Current capacity
- Next Best Action
- Remaining backlog count
- Option to finish recovery and return to Dashboard

---

## 9. Backlog Classification

Each active backlog task should be classified as:

```text
URGENT
IMPORTANT
FLEXIBLE
STALE
UNCLEAR
```

### URGENT

- Overdue hard deadline
- Due today
- Due within 24 hours
- High-priority deadline at risk

### IMPORTANT

- Due within 3 days
- Blocking another important task
- High priority without immediate deadline

### FLEXIBLE

- No near-term deadline
- Not pinned
- Not blocking important work
- Safe to reschedule

### STALE

- Very old task
- Repeatedly postponed
- No recent activity
- Potentially no longer relevant

### UNCLEAR

- Vague title
- Missing outcome
- Unknown deadline meaning
- Insufficient context

Stale does not mean disposable.

---

## 10. Recovery Reason Codes

```text
OVERDUE_HARD_DEADLINE
DUE_TODAY
DUE_SOON
HIGH_PRIORITY
BLOCKING_OTHER_WORK
FLEXIBLE_BACKLOG
REPEATEDLY_POSTPONED
LONG_INACTIVE_PERIOD
TASK_STALE
TASK_NEEDS_CLARIFICATION
BACKLOG_EXCEEDS_CAPACITY
SAFE_TO_DEFER
RESTART_ACTION_AVAILABLE
```

---

## 11. Restart Candidate Selection

Recovery Mode should reuse Next Best Action where possible.

Preferred precedence:

1. Urgent eligible task that fits available time
2. Important task with a clear first action
3. Short actionable task that reduces backlog
4. Clarified first action from a larger important task
5. If none exist, offer Task Clarification

Recovery Mode must not create a separate ranking engine.

---

## 12. Backlog Visibility Reduction

Recovery Mode should deliberately reduce visible task count.

Suggested default:

```text
3 urgent/important tasks
+
1 restart action
+
3 flexible backlog suggestions
```

The user may choose:

```text
Show more backlog
```

---

## 13. Recovery Proposal Types

Supported MVP actions:

```text
KEEP_ACTIVE
DEFER_TO_LATER_DAY
REMOVE_FROM_TODAY
REVIEW_DEADLINE
CLARIFY_TASK
MARK_FOR_LATER_REVIEW
```

No delete or archive action in MVP.

---

## 14. Bulk Deferral

Recovery Mode may propose moving multiple flexible tasks.

Requirements:

- Only flexible tasks
- Hard deadlines protected
- Target days checked for overload
- Reuse Schedule Repair scheduling logic where possible
- Do not move everything to tomorrow
- Cap batch size

Suggested maximum:

```text
5 tasks per bulk proposal
```

---

## 15. Stale Task Handling

Recovery Mode may identify stale tasks but must not assume they should be removed.

Suggested prompt:

```text
This task has been carried forward several times and has no deadline.

[Keep active] [Review later]
```

MVP must not delete or archive automatically.

---

## 16. Existing Feature Integration

### Task Clarification

If an important or urgent task is too vague to start, route to the existing Task Clarification flow.

### Schedule Repair

Reuse Schedule Repair for:

- Safe future-day selection
- Hard-deadline protection
- Future-day capacity checks
- Move proposals
- Idempotent apply
- Stale-state protection

### Adaptive Daily Capacity

Use current remaining capacity to determine how much work belongs in the restart plan.

### Daily Executive Brief

After Recovery Mode completes, regenerate the Daily Executive Brief.

### Next Best Action

Reuse the existing Next Best Action service and refresh it after recovery changes.

---

## 17. Recovery Session Data Model

Suggested path:

```text
users/{userId}/recoverySessions/{recoveryId}
```

```ts
export type RecoverySessionStatus =
  | "ACTIVE"
  | "PARTIALLY_APPLIED"
  | "COMPLETED"
  | "DISMISSED"
  | "EXPIRED";

export interface RecoverySession {
  id: string;
  userId: string;
  localDate: string;
  triggerCodes: string[];

  backlogCount: number;
  overdueCount: number;
  urgentCount: number;
  flexibleCount: number;
  staleCount: number;

  remainingCapacity?: {
    min: number;
    max: number;
  } | null;

  restartTaskId?: string | null;
  nextBestActionRecommendationId?: string | null;

  actions: RecoveryAction[];
  sourceTaskVersionHash: string;

  status: RecoverySessionStatus;

  createdAt: string;
  expiresAt: string;
  completedAt?: string | null;
}
```

---

## 18. Recovery Action Model

```ts
export interface RecoveryAction {
  id: string;

  type:
    | "KEEP_ACTIVE"
    | "DEFER_TO_LATER_DAY"
    | "REMOVE_FROM_TODAY"
    | "REVIEW_DEADLINE"
    | "CLARIFY_TASK"
    | "MARK_FOR_LATER_REVIEW";

  taskId: string;
  taskVersion: string;

  fromDate?: string | null;
  toDate?: string | null;

  reasonCodes: string[];
  selected: boolean;

  status:
    | "PROPOSED"
    | "APPLIED"
    | "REJECTED"
    | "FAILED";
}
```

---

## 19. Session Expiry and Stale Protection

Suggested expiry:

```text
24 hours
```

Expire earlier if:

- Major task changes occur
- User completes recovery
- User dismisses recovery
- Local date changes and the proposal is no longer relevant

Before apply:

- Re-read referenced tasks
- Compare versions
- Recheck hard deadlines
- Recheck target-day capacity

Do not apply stale recovery actions.

---

## 20. Recovery Review UI

Recommended layout:

```text
RECOVERY MODE

You have 14 tasks carried over.
3 need attention soon.

Start here:
Submit school permission form
10 min

Needs attention:
• Pay electricity bill — overdue
• Finish Play Store screenshots — due tomorrow
• Call dentist — due Thursday

Can wait:
☑ Move "Research notifications" to Monday
☑ Review "Clean garage" later
☐ Keep "Update profile copy" active

[Apply selected changes]
[Keep current plan]
```

Recovery Mode should show a compact three-stage progress indicator:

```text
1. What matters now
2. What can wait
3. Restart
```

Users may exit at any time.

---

## 21. Apply Semantics

On apply:

1. Authenticate user
2. Verify recovery-session ownership
3. Re-read referenced tasks
4. Verify task versions
5. Recheck hard deadlines
6. Recheck target-day capacity
7. Apply selected scheduling actions through existing services
8. Record before/after values
9. Update recovery session
10. Refresh Daily Executive Brief
11. Refresh Next Best Action
12. Offer Undo where supported

---

## 22. Partial Acceptance

Users may apply only some recovery actions.

After partial acceptance:

- Recalculate current backlog
- Recalculate Daily Brief
- Do not force resolution of remaining tasks
- Allow the user to finish recovery anyway

Example:

```text
You still have 8 tasks waiting for later review.
They won't be included in today's restart plan.
```

---

## 23. Manual Activation and Detection

Recovery Mode must always be manually accessible.

Suggested entry points:

- Dashboard action menu
- Daily Executive Brief
- Tasks page

Recommended label:

```text
Recovery Mode
```

Automatic detection should only suggest it.

Example:

```text
Your plan has built up over the last few days.

Recovery Mode can separate what needs attention now from what can wait.

[Open Recovery Mode] [Not now]
```

Suggested suppression after dismissal:

```text
24 hours
```

Do not auto-open it.

---

## 24. AI Role

AI is optional.

AI may:

- Rephrase deterministic summary text
- Compress explanation wording
- Produce a concise recovery summary from structured facts

AI must not:

- Decide urgency
- Decide what to move
- Decide what to delete
- Invent deadlines
- Infer emotional state
- Apply changes

Core recovery logic must remain deterministic.

---

## 25. API Contracts

### Eligibility

```http
GET /api/executive-function/recovery/eligibility
```

### Create Recovery Session

```http
POST /api/executive-function/recovery
```

### Refresh

```http
POST /api/executive-function/recovery/{recoveryId}/refresh
```

### Apply

```http
POST /api/executive-function/recovery/{recoveryId}/apply
```

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

### Dismiss

```http
POST /api/executive-function/recovery/{recoveryId}/dismiss
```

### Complete

```http
POST /api/executive-function/recovery/{recoveryId}/complete
```

---

## 26. Idempotency, Ownership, and Security

Apply operations must be idempotent.

Repeated requests must:

- Return the original result
- Not move tasks twice
- Not duplicate audit entries

Security requirements:

- Recovery sessions are user-scoped
- Server loads task state directly
- Client does not provide trusted task state
- Cross-user task data is never exposed
- Shared-task permissions are respected
- Recovery actions cannot mutate tasks the user cannot edit

---

## 27. Privacy

Prefer storing:

- Task IDs
- Dates
- Counts
- Duration totals
- Reason codes
- Before/after scheduling values
- Recovery-action status

Avoid storing:

- Task notes
- Brain Dump raw source
- Clarification raw source
- AI reasoning
- Unrelated personal data

Analytics must not contain task titles.

---

## 28. Analytics Events

```text
recovery_mode_offered
recovery_mode_opened
recovery_mode_dismissed
recovery_mode_generated
recovery_restart_task_started
recovery_action_selected
recovery_action_rejected
recovery_actions_applied
recovery_partially_applied
recovery_completed
recovery_expired
recovery_stale
recovery_failed
```

Safe properties:

- Trigger codes
- Backlog-count bucket
- Overdue-count bucket
- Urgent-count bucket
- Flexible-count bucket
- Capacity bucket
- Number of actions
- Number applied
- Restart-task available
- Latency

---

## 29. Success Metrics

Primary metric:

> Percentage of Recovery Mode sessions followed by a task session starting within 15 minutes.

Supporting metrics:

- Recovery-offer acceptance rate
- Recovery completion rate
- Restart-task start rate
- Bulk-deferral acceptance rate
- Reduction in visible backlog
- Reduction in overdue backlog after recovery
- Return-to-app retention after recovery
- Recovery dismissal rate
- Recovery undo rate
- Percentage requiring Task Clarification

---

## 30. Guardrail Metrics

Monitor:

- Hard-deadline tasks deferred incorrectly
- Cross-user task exposure
- Excessive Recovery Mode prompting
- Stale proposals applied
- Tasks hidden from today without approval
- Tasks deleted or archived automatically
- Future-day overload created
- Psychological or medical claims in summaries
- Undo overwriting later edits

Any automatic deletion or hard-deadline violation is a critical defect.

---

## 31. Failure Handling

### No Recovery Needed

```text
Your current plan doesn't need a recovery reset.
```

### Recovery Generation Failure

```text
TaskLaunch couldn't prepare Recovery Mode right now. Your current plan has not changed.
```

### No Safe Deferrals

```text
Most of the remaining work is time-sensitive. TaskLaunch couldn't find safe tasks to move.
```

Offer:

```text
Review deadlines
Make a task easier to start
```

---

## 32. Performance Targets

| Operation | Target |
|---|---:|
| Eligibility detection | Under 300 ms |
| Backlog classification | Under 500 ms |
| Recovery proposal generation | Under 1 second |
| Apply recovery | Under 2 seconds |
| Cached recovery load | Under 300 ms |

No AI call is required for core Recovery Mode.

---

## 33. Accessibility Requirements

Recovery Mode must support:

- Keyboard navigation
- Screen readers
- Clear stage headings
- Large touch targets
- Accessible task selection
- No colour-only urgency communication
- Clear deadline text
- Clear before/after scheduling values
- Reduced motion
- Clear loading/failure announcements
- Accessible expand/collapse controls

---

## 34. MVP Scope

### Included

- Automatic recovery eligibility detection
- Manual activation
- Backlog classification
- Urgent/important/flexible/stale/unclear states
- Restart task
- Backlog visibility reduction
- Safe deferral proposals
- Review-later queue
- Clarification handoff
- Schedule Repair reuse
- Adaptive Capacity integration
- Daily Brief refresh
- Next Best Action refresh
- Partial acceptance
- Stale-state protection
- Idempotent apply
- Safe undo integration
- Analytics
- Unit, integration, fixture, and E2E tests

### Excluded

- Automatic task deletion
- Automatic archival
- Automatic recovery application
- Push recovery notifications
- Calendar integration
- Multi-week backlog optimisation
- AI-generated coaching conversations
- Trusted Automation
- Health or mood inference

---

## 35. Phase Two Scope

Phase Two may introduce:

- Trusted low-risk backlog deferral
- Scheduled weekly recovery checks
- Recovery notifications
- Batch archival with explicit user review
- Multi-week recovery planning
- Work/home recovery profiles
- Recurring-task recovery policies
- Long-term stale-task review

---

## 36. Ordered Build Plan

### Phase 1: Recovery Contract and Eligibility

1. Inspect Daily Brief, Capacity, Schedule Repair, NBA, and Task Clarification contracts
2. Define trigger codes
3. Define backlog classifications
4. Define recovery action types
5. Define eligibility thresholds
6. Implement deterministic recovery eligibility
7. Add suppression-after-dismissal
8. Add unit tests

### Phase 2: Backlog Classification and Restart Candidate

1. Load active backlog
2. Classify urgent/important/flexible/stale/unclear
3. Protect hard deadlines
4. Integrate Next Best Action
5. Select restart action
6. Add visible-task limits
7. Add deterministic tests

### Phase 3: Recovery Proposal and Persistence

1. Add recovery-session schema
2. Generate safe deferral actions
3. Reuse Schedule Repair target-day logic
4. Add review-later actions
5. Add expiry
6. Add task-version hash
7. Add APIs
8. Add ownership tests

### Phase 4: Recovery UI

1. Build Recovery Mode entry
2. Build stage layout
3. Add urgent section
4. Add restart task
5. Add flexible backlog section
6. Add selections
7. Add progress states
8. Add responsive layout
9. Add accessibility

### Phase 5: Apply and Integration

1. Add idempotent apply
2. Add stale checks
3. Add partial acceptance
4. Add Task Clarification handoff
5. Refresh Daily Brief
6. Refresh Next Best Action
7. Add undo integration
8. Add analytics
9. Add E2E tests
10. Add guardrails

---

## 37. Testing Requirements

### Unit Tests

Cover:

- Trigger thresholds
- Dismissal suppression
- Backlog classification
- Deadline protection
- Stale-task classification
- Restart-candidate eligibility
- Visible-task limits
- Safe-deferral eligibility
- Reason-code generation

### Integration Tests

Cover:

- Owned recovery-session generation
- Cross-user denial
- Schedule Repair reuse
- Adaptive Capacity consumption
- Next Best Action reuse
- Clarification handoff
- Expiry
- Stale-state detection
- Idempotent apply
- Daily Brief refresh

### End-to-End Tests

1. Returning user is offered Recovery Mode
2. User can dismiss it
3. Urgent tasks are surfaced
4. Flexible backlog is collapsed
5. Restart task is shown
6. Hard-deadline task is never deferred
7. User applies only selected deferrals
8. Daily Brief refreshes afterward
9. Next Best Action refreshes afterward
10. Recovery completes without forcing unresolved backlog decisions

---

## 38. Deterministic Evaluation Fixtures

Create at least 100 Recovery Mode scenarios.

Include:

- 3-day inactivity
- 7-day inactivity
- Small backlog
- Large backlog
- Multiple overdue tasks
- No overdue tasks
- Hard deadlines
- Flexible backlog
- Stale tasks
- Unclear tasks
- Low capacity
- High capacity
- No safe deferrals
- Mixed priorities
- Repeated postponement

Validate:

- Correct recovery eligibility
- Correct urgency classification
- Safe deferral choices
- Stable restart task
- No hard-deadline violations
- No forced deletion
- Correct visible-task limits
- Stable reason codes

---

## 39. Recommended Product Copy

### Offer

```text
Your plan has built up over the last few days.
```

```text
Recovery Mode can separate what needs attention now from what can wait.
```

### Entry

```text
Open Recovery Mode
```

### Heading

```text
Let's reset the plan
```

### Urgent Section

```text
Needs attention
```

### Restart Section

```text
Start here
```

### Flexible Section

```text
Can wait
```

### Review Later

```text
Review later
```

### Apply

```text
Apply selected changes
```

### Finish

```text
Finish recovery
```

---

## 40. Codex Implementation Rules

1. Inspect existing Daily Executive Brief, Adaptive Capacity, Schedule Repair, Next Best Action, and Task Clarification implementations before coding.
2. Reuse existing scheduling and ranking services.
3. Do not create a parallel repair or ranking engine.
4. Keep recovery eligibility and backlog classification deterministic.
5. Do not use AI to decide urgency, deletion, or scheduling.
6. Protect hard deadlines before proposing deferrals.
7. Do not automatically archive or delete tasks.
8. Do not auto-open Recovery Mode.
9. Respect dismissal suppression.
10. Limit visible backlog by default.
11. Keep thresholds configurable.
12. Use idempotency for apply.
13. Add stale-state checks before apply.
14. Keep task content out of analytics.
15. Add one failing public-interface test before each behaviour.
16. Mock only external boundaries such as Firebase, network, and time.
17. Do not implement Trusted Automation yet.
18. Document deviations from this PRD.

---

## 41. Definition of Done

The MVP is complete when:

- Recovery eligibility is deterministic
- Manual activation works
- Backlog is classified safely
- Hard deadlines are protected
- One restart action is surfaced
- Visible backlog is reduced
- Flexible tasks can be proposed for deferral
- Stale tasks can be marked for later review
- No task is deleted or archived automatically
- Partial acceptance works
- Stale recovery actions cannot apply
- Apply is idempotent
- Daily Executive Brief refreshes
- Next Best Action refreshes
- Task Clarification handoff works
- Cross-user access is prevented
- Analytics exclude task content
- Unit, integration, fixture, and E2E tests pass

---

## 42. Recommended First Codex Task

```text
Build the TaskLaunch Recovery Mode eligibility and backlog-classification foundation.

Requirements:
- Inspect the existing Daily Executive Brief, Adaptive Daily Capacity, Schedule Repair, Next Best Action, Task Clarification, task scheduling, and history implementations.
- Define Recovery Mode trigger codes.
- Define backlog classification states.
- Define Recovery Mode action types.
- Define configurable eligibility thresholds.
- Implement deterministic Recovery Mode eligibility.
- Implement deterministic backlog classification.
- Protect hard deadlines.
- Add dismissal suppression.
- Do not build Recovery Mode UI yet.
- Do not move, archive, delete, or modify tasks.
- Do not use AI.
- Add unit tests for inactivity, backlog thresholds, overdue thresholds, hard-deadline protection, stale tasks, unclear tasks, and dismissal suppression.
- Follow incremental TDD.
```
