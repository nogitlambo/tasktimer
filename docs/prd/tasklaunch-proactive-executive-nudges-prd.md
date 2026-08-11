# TaskLaunch Proactive Executive Nudges

## Product Requirements Document

**Status:** Draft for implementation\
**Product:** TaskLaunch\
**Feature:** Proactive Executive Nudges\
**Parent capability:** Executive Function Engine\
**Preceding core features:** Intelligent Brain Dump; Task Clarification
and Decomposition; Next Best Action; Daily Executive Brief; Adaptive
Daily Capacity; Automatic Schedule Repair; Recovery Mode; Trusted
Automation; Executive Experience\
**Target platforms:** Responsive web and Android\
**Primary objective:** Deliver a small number of timely, context-aware
interventions that help the user start, adjust, recover, or protect
important work without creating notification overload.

## 1. Product Summary

Proactive Executive Nudges brings TaskLaunch's existing Executive
Function intelligence to the user at useful moments instead of requiring
the user to repeatedly open the app.

A nudge is not a conventional reminder. It uses current task, capacity,
focus-window, deadline, repair, recovery, and session state to determine
whether an intervention is useful **now**.

The feature must solve two problems:

1.  Determine whether an intervention is useful.
2.  Determine whether it is valuable enough to interrupt the user.

Multiple Executive services may identify conditions simultaneously.
TaskLaunch must arbitrate between them rather than send competing
notifications.

> The goal is not to notify more. The goal is to interrupt less, but
> better.

## 2. Product Principles

Nudges must be context-aware, sparse, actionable, deterministic in
eligibility/arbitration, explainable, user-controlled, quiet by default,
respectful of focus/quiet hours, duplicate-resistant, privacy-conscious,
and useful without an LLM.

Normal states should remain quiet. Exceptional or useful opportunities
should surface themselves.

## 3. Goals

The MVP must:

-   Generate deterministic nudge candidates from existing feature state
-   Rank competing candidates
-   Deliver at most the highest-value eligible intervention
-   Respect quiet hours and preferences
-   Enforce cooldowns and daily limits
-   Suppress duplicates and recently dismissed interventions
-   Suppress inappropriate nudges during active sessions
-   Validate source freshness before delivery
-   Deep-link into existing workflows
-   Record delivery/outcome history
-   Use Trusted Automation for orchestration
-   Support in-app and Android push delivery

The MVP will not use an LLM to decide when to interrupt, infer
mood/health state, monitor other apps, automatically start tasks,
automatically apply repair/recovery, change deadlines, send email/SMS,
or use reinforcement learning.

## 4. Core User Stories

-   **Start at a useful moment:** Surface an appropriate task when a
    useful work window exists.
-   **Protect a deadline:** Alert when important work becomes
    time-sensitive.
-   **Fix an overloaded plan:** Surface Schedule Repair when the current
    plan needs attention.
-   **Resume after disruption:** Offer a small restart action when
    returning to work.
-   **Avoid notification overload:** Choose one intervention instead of
    notifying about every condition.
-   **Control interruptions:** Let users control nudge types, quiet
    hours, and pause state.

## 5. Nudge Catalog

Initial types:

``` text
START_OPPORTUNITY
FOCUS_WINDOW_START
DEADLINE_RISK
PLAN_OVERLOAD
RECOVERY_SUGGESTED
FIRST_ACTION_AVAILABLE
RESUME_TASK
PLAN_CHANGED
```

Sources:

  Nudge                    Authoritative source
  ------------------------ --------------------------------------------
  Start opportunity        Next Best Action + Adaptive Daily Capacity
  Focus window             Existing focus preferences + NBA
  Deadline risk            Daily Executive Brief
  Plan overload            Daily Executive Brief + Schedule Repair
  Recovery suggested       Recovery Mode eligibility
  First action available   Task Clarification
  Resume task              Session history + NBA
  Plan changed             Trusted Automation domain events

Examples:

``` text
Good time to start
"Test checkpoints" fits the time you have available.
[Start now]
```

``` text
Today's plan no longer fits
TaskLaunch found safe adjustments.
[Review repair]
```

``` text
Your plan has built up
Only 3 tasks need attention soon.
[Open Recovery Mode]
```

## 6. Architecture

``` text
Executive Function services
        ↓
Trusted Automation domain events
        ↓
Nudge candidate generators
        ↓
Nudge Arbitration Engine
        ↓
Eligibility / suppression gates
        ↓
Highest-value candidate
        ↓
Delivery policy
        ↓
In-app or Android push
        ↓
Existing feature workflow
```

Trusted Automation owns orchestration. Existing feature modules remain
authoritative for their own state, freshness, actions, mutations,
telemetry, and security.

## 7. Candidate Contract

``` ts
interface ExecutiveNudgeCandidate {
  id: string;
  userId: string;
  type: ExecutiveNudgeType;
  sourceFeature: string;
  sourceEntityId?: string | null;
  sourceEntityVersion?: string | null;
  priority: number;
  urgency: number;
  usefulness: number;
  interruptionCost: number;
  reasonCodes: ExecutiveNudgeReasonCode[];
  action: ExecutiveNudgeAction;
  createdAt: string;
  expiresAt: string;
}
```

Candidates are ephemeral decision objects, not notifications by
themselves.

## 8. Arbitration

Pipeline:

``` text
candidates
→ source freshness
→ eligibility
→ user preferences
→ quiet hours
→ active session
→ cooldowns
→ duplicate suppression
→ dismissal suppression
→ priority
→ urgency
→ usefulness
→ interruption cost
→ highest-value candidate
→ deliver or suppress all
```

Suggested deterministic score:

``` text
score =
  priorityWeight
  + urgencyWeight
  + usefulnessWeight
  - interruptionCost
  - recentNudgePenalty
  - recentDismissalPenalty
```

Weights must be configurable. No LLM arbitration.

Priority classes:

``` text
CRITICAL_ATTENTION
HIGH
NORMAL
LOW
```

"Critical" means product priority, not emergency/safety messaging.

## 9. Suppression Policy

Stable suppression codes:

``` text
NUDGES_PAUSED
NUDGE_TYPE_DISABLED
QUIET_HOURS
ACTIVE_TASK_SESSION
GLOBAL_COOLDOWN
TYPE_COOLDOWN
DUPLICATE
RECENTLY_DISMISSED
SOURCE_STALE
SOURCE_INVALID
ACTION_NO_LONGER_AVAILABLE
LOW_VALUE
HIGHER_PRIORITY_SELECTED
DAILY_LIMIT_REACHED
```

Suppression is a successful arbitration result, not an error.

During an active task session, suppress start opportunity, focus-window,
first-action, and resume nudges by default.

Suggested configurable defaults:

``` text
Quiet hours: 22:00–08:00 local
Global push cooldown: 60 minutes
Same-type cooldown: 3 hours
Same-task cooldown: 6 hours
Dismissed nudge suppression: 24 hours
Maximum proactive push nudges: 3 per local day
```

Do not queue stale notifications for delivery after quiet hours.

## 10. Duplicate and Freshness Rules

Suggested duplicate key:

``` text
userId + nudgeType + sourceEntityId + actionType + semanticWindow
```

Immediately before delivery validate that the source remains current:
NBA is current, repair proposal active, Recovery Mode still eligible,
deadline state still exists, task incomplete and accessible, and
capacity/context has not materially invalidated the candidate.

Never deliver a stale actionable nudge merely because it was previously
queued.

## 11. Delivery Channels

MVP:

``` text
IN_APP
ANDROID_PUSH
```

Future:

``` text
WEB_PUSH
```

In-app nudges may appear in Dashboard Executive Summary, Executive page,
or a compact contextual banner. Do not stack multiple nudge banners.

Android push requirements:

-   concise title/body
-   one primary action where supported
-   deep-link to existing workflow
-   no sensitive notes/raw AI content
-   freshness check before send
-   server-side delivery record

## 12. Deep-Link Actions

``` text
START_TASK
VIEW_TASK
OPEN_EXECUTIVE
OPEN_SCHEDULE_REPAIR
OPEN_RECOVERY_MODE
OPEN_TASK_CLARIFICATION
RESUME_TASK
```

Every action invokes the existing owning workflow. No nudge-specific
mutation implementation.

## 13. User Preferences

Suggested settings:

``` text
PROACTIVE NUDGES

Proactive nudges              [ On ]
Start opportunities           [ On ]
Focus-window nudges           [ On ]
Deadline risk                 [ On ]
Plan adjustments              [ On ]
Recovery suggestions          [ On ]

Quiet hours                   22:00 → 08:00
Maximum push nudges per day   3

[Pause nudges]
```

Use product-facing labels rather than internal rule IDs.

## 14. Trusted Automation Integration

Trusted Automation owns event orchestration, rule permission, pause
state where applicable, idempotency, execution history, retry
infrastructure, and auditability.

Nudge Arbitration owns candidate comparison, nudge-specific suppression,
interruption policy, and delivery selection.

Do not create a second generic automation engine.

Generating a nudge never grants authority to perform its suggested
mutation:

``` text
Schedule Repair nudge → open repair review → never auto-apply
Recovery nudge → open Recovery Mode → never auto-defer
Clarification nudge → open clarification → never auto-apply
```

## 15. Persistence

Suggested paths:

``` text
users/{userId}/nudgePreferences/current
users/{userId}/nudgeDeliveries/{deliveryId}
```

Suggested delivery record:

``` ts
interface ExecutiveNudgeDelivery {
  id: string;
  userId: string;
  candidateType: ExecutiveNudgeType;
  sourceFeature: string;
  sourceEntityId?: string | null;
  channel: "IN_APP" | "ANDROID_PUSH";
  reasonCodes: string[];
  status:
    | "DELIVERED"
    | "OPENED"
    | "ACTIONED"
    | "DISMISSED"
    | "EXPIRED"
    | "SUPPRESSED";
  suppressionCode?: string | null;
  createdAt: string;
  deliveredAt?: string | null;
  actionedAt?: string | null;
}
```

Avoid candidate persistence unless required for queueing/arbitration.

## 16. Telemetry and Privacy

Never include task titles, notes, Brain Dump content, clarification
text, notification body text, or raw AI content in analytics.

Events:

``` text
executive_nudge_candidate_created
executive_nudge_selected
executive_nudge_suppressed
executive_nudge_delivered
executive_nudge_opened
executive_nudge_actioned
executive_nudge_dismissed
executive_nudge_expired
executive_nudges_paused
executive_nudges_resumed
executive_nudge_preference_changed
```

Safe properties include nudge type, source feature, channel, priority
band, reason codes, suppression code, time-of-day bucket, cooldown
state, and latency.

## 17. Success Metrics

Primary metric:

> Percentage of delivered actionable nudges followed by the intended
> workflow action within 15 minutes.

Supporting metrics:

-   task-start rate
-   repair-review rate
-   Recovery Mode open rate
-   deadline-risk action rate
-   dismissal rate
-   notification permission retention
-   daily nudge count
-   suppression rate
-   duplicate suppression rate
-   time from nudge to action
-   percentage of days with zero push nudges

A healthy system should frequently choose to send nothing.

## 18. Guardrails

Monitor excessive daily nudges, repeated same-task nudges, quiet-hour
violations, stale actionable nudges, unnecessary interruption during
active focus, disabled/paused delivery, cross-user exposure, content
leakage, high dismissal rate, push permission revocation, and competing
nudges delivered together.

Any cross-user notification or delivery during a prohibited state is a
critical defect.

## 19. Failure Handling

-   Candidate generation failure → fail quiet.
-   Arbitration failure → fail quiet.
-   Push failure → bounded retry only while candidate remains fresh.
-   Deep-link failure → open closest safe owning feature surface; never
    substitute a mutation.
-   Source feature unavailable → suppress candidate.

Do not notify users that the nudge engine itself failed.

## 20. Performance Targets

  Operation                                          Target
  ---------------------- ----------------------------------
  Candidate generation                  \<200 ms per source
  Arbitration                                      \<100 ms
  Suppression checks                               \<100 ms
  Delivery decision        \<500 ms excluding push provider

Nudge evaluation must not materially slow normal task mutations.

## 21. Accessibility

In-app nudge surfaces must support keyboard navigation, screen readers,
visible focus, clear primary/dismiss actions, non-colour-only priority,
reduced motion, and accessible preference controls.

## 22. MVP Scope

Included:

-   Nudge catalog
-   Candidate generators
-   Deterministic arbitration
-   Priority/usefulness/interruption scoring
-   Quiet hours
-   Global/type/task cooldowns
-   Daily push limit
-   Duplicate/dismissal/active-session suppression
-   Freshness validation
-   In-app delivery
-   Android push
-   Deep links
-   Preferences
-   Trusted Automation integration
-   Delivery history
-   Privacy-safe telemetry
-   Tests

Excluded:

-   Web push
-   Email/SMS
-   Wearables
-   Health/mood inference
-   LLM arbitration
-   Reinforcement learning
-   Automatic repair/recovery application
-   Automatic task start
-   Calendar-based nudges

## 23. Ordered Build Plan

### Phase 1 --- Contract and Arbitration

1.  Define types, reasons, suppression codes, candidates/actions,
    preferences.
2.  Implement deterministic arbitration and configurable weights.
3.  Add unit tests.

### Phase 2 --- Suppression

1.  Quiet hours.
2.  Global/type/task cooldowns.
3.  Dismissal suppression.
4.  Daily limit.
5.  Active-session suppression.
6.  Duplicate suppression.
7.  Freshness validation.

### Phase 3 --- Candidate Adapters

Add adapters for NBA, focus window, deadline risk, plan overload,
Recovery Mode, first action, resume task, and plan changed. Reuse
existing services/events.

### Phase 4 --- In-App Experience

Add one contextual nudge surface, actions, dismiss, preferences,
accessibility, and telemetry.

### Phase 5 --- Android Push

Add delivery adapter, permission integration, deep links/actions,
freshness-before-send, delivery history, and bounded failure handling.

### Phase 6 --- Hardening

Add cross-user, quiet-hour, duplicate-storm, stale-source,
active-session, push-failure, analytics-redaction, performance,
feature-flag, and rollout tests.

## 24. Testing Requirements

Unit tests must cover eligibility, arbitration ordering/ties, quiet
hours, cooldowns, limits, duplicate/dismissal/active-session
suppression, freshness, reason codes, and suppression codes.

Integration tests must cover Trusted Automation events and all
source-feature adapters, preferences, push delivery, deep links, and
history.

E2E scenarios:

1.  Useful start opportunity produces one nudge.
2.  Multiple candidates produce only the highest-value nudge.
3.  Quiet hours suppress push.
4.  Active task suppresses start nudge.
5.  Same task is not repeatedly nudged.
6.  Dismissed nudge remains suppressed.
7.  Stale NBA is not delivered.
8.  Repair nudge opens existing repair review.
9.  Recovery nudge opens existing Recovery Mode.
10. Push deep-link reaches the correct workflow.

## 25. Deterministic Evaluation Suite

Create at least 150 arbitration fixtures covering:

-   single and multiple candidates
-   deadline vs start opportunity
-   repair vs recovery
-   active sessions
-   quiet hours
-   cooldowns
-   daily limits
-   duplicate candidates
-   dismissed candidates
-   stale sources
-   same task across nudge types
-   focus-window boundaries
-   low/high capacity
-   no eligible candidate

Validate that exactly zero or one candidate is selected, ordering is
stable, suppression codes are correct, and stale/disabled/paused
candidates never deliver.

## 26. Codex Implementation Rules

1.  Inspect Trusted Automation and all source feature contracts before
    coding.
2.  Reuse existing services, parsers, APIs, freshness semantics,
    mutations, telemetry, and security boundaries.
3.  Do not create a second automation engine.
4.  Keep arbitration deterministic.
5.  Do not use AI for interruption decisions.
6.  Fail quiet when uncertain.
7.  Prefer suppression over low-value interruption.
8.  Validate source freshness immediately before delivery.
9.  Never bypass existing confirmation boundaries.
10. Keep thresholds/weights/cooldowns configurable.
11. Do not leak task content into telemetry.
12. Add one observable failing test before each behaviour.
13. Preserve current Android notification infrastructure where reusable.
14. Use feature flags for rollout.
15. Document deviations.

## 27. Definition of Done

The MVP is complete when:

-   Existing feature state can generate deterministic candidates
-   Competing candidates are arbitrated to zero or one intervention
-   Quiet hours, cooldowns, limits, duplicates, dismissals, active
    sessions, and stale sources are enforced
-   In-app nudges work
-   Android push works
-   Deep links use existing workflows
-   User preferences and pause controls work
-   Trusted Automation orchestration is reused
-   No consequential mutation bypasses confirmation
-   Delivery/outcome history exists
-   Cross-user delivery is prevented
-   Telemetry is content-safe
-   Evaluation, unit, integration, and E2E tests pass

## 28. Recommended First Codex Task

``` text
Review the current Trusted Automation, Android notification, Executive UI, Next Best Action, Daily Executive Brief, Adaptive Daily Capacity, Schedule Repair, Recovery Mode, Task Clarification, focus-window, and session-history implementations against this PRD.

Before changing code:

1. Identify existing domain events and automation rules that can produce nudge candidates.
2. Identify existing Android push/notification infrastructure and deep-link handling.
3. Identify existing user notification preferences and quiet-hour support.
4. Identify existing freshness and stale-state contracts for each source feature.
5. Propose dependency-ordered tracer-bullet GitHub issues.
6. Keep arbitration deterministic and separate from source-feature business logic.
7. Treat existing feature services as reuse targets, not automatic blockers.
8. Stop for HITL only if repository inspection reveals a genuine product/contract incompatibility.

Present the proposed issue breakdown before publishing issues.
```
