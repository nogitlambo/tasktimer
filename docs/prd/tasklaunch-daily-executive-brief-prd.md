# TaskLaunch Daily Executive Brief

## Product Requirements Document

**Status:** Draft for implementation  
**Product:** TaskLaunch  
**Feature:** Daily Executive Brief  
**Parent capability:** Executive Function Engine  
**Preceding core features:** Intelligent Brain Dump; AI Task Clarification and Decomposition; Next Best Action  
**Target platforms:** Responsive web and Android-compatible web UI  
**Primary stack:** Next.js, React, TypeScript, Firebase Authentication, Firestore, hosted server API, OpenAI API, Zod  
**Primary objective:** Give the user a concise, realistic, explainable daily plan that reduces planning effort and highlights the most useful actions for the current day.

---

## 1. Product Summary

The Daily Executive Brief is the first day-level planning feature in the TaskLaunch Executive Function Engine.

It should transform existing TaskLaunch data into a short daily overview that answers:

- What matters most today?
- How much work looks realistic?
- What should I start with?
- Is today overloaded?
- What can safely move?
- Are any deadlines at risk?
- Is there anything I should clarify before starting?

The brief should combine deterministic planning logic with optional AI-generated natural-language summarisation.

The brief must not act as an autonomous scheduler in the MVP.

The core principle is:

> Show the user the shape of the day without making them plan the whole day.

---

## 2. Product Principle

> One brief, a few decisions, then start.

The Daily Executive Brief should reduce cognitive load rather than create another dashboard to manage.

The experience must remain:

- Short
- Action-oriented
- Explainable
- Nonjudgmental
- Deterministic at its core
- Refreshable
- Reversible where proposed changes are offered
- Useful even if the AI provider is unavailable

---

## 3. Problem Statement

Even with structured tasks and a Next Best Action, users still need to understand the overall shape of the day.

Common questions include:

- Am I trying to do too much?
- Which tasks genuinely need attention today?
- What should I ignore until later?
- Do I have enough time for what I planned?
- Which tasks should be moved?
- Which deadline is becoming risky?
- Is my focus window being used effectively?
- What is one meaningful win if today is low capacity?

Without this layer, users may still manually inspect multiple tasks, compare durations, review schedules, and repeatedly reorganise plans.

TaskLaunch should summarise the day into a practical, low-friction brief.

---

## 4. Goals

### 4.1 Primary Goals

The feature must:

- Generate one concise daily brief
- Identify the day’s primary task
- Surface the current Next Best Action
- Calculate planned workload versus realistic available time
- Detect when the day is overloaded
- Identify due-today and due-soon tasks
- Suggest a small number of low-risk plan adjustments
- Respect current focus-window preferences
- Use deterministic calculations for workload and risk
- Explain suggestions using stable reason codes
- Allow the user to refresh the brief
- Preserve usefulness if AI summarisation fails
- Never apply schedule changes automatically in MVP

### 4.2 Secondary Goals

The feature should:

- Reduce manual planning time
- Improve planned-versus-completed workload accuracy
- Reduce repeated rescheduling
- Encourage users to start with a realistic first action
- Support low-capacity days without punitive messaging
- Provide a foundation for Adaptive Daily Capacity
- Provide a foundation for Schedule Repair
- Provide a foundation for Recovery Mode
- Generate outcome data for later personalisation

### 4.3 Non-Goals

The MVP will not:

- Automatically move tasks
- Automatically change deadlines
- Automatically reduce task goals
- Infer medical or emotional state
- Read calendar data
- Use wearable data
- Generate a minute-by-minute schedule
- Continuously regenerate in the background
- Send proactive AI notifications
- Personalise ranking weights automatically
- Replace the existing Tasks or Dashboard views

---

## 5. Core User Stories

### Understand Today

As a user, I want a concise summary of what matters today so I do not have to scan my entire task list.

### See If the Day Is Realistic

As a user, I want TaskLaunch to tell me if the planned workload exceeds the time I realistically have available.

### Know What to Start With

As a user, I want the brief to surface the current Next Best Action so I can begin immediately.

### Reduce Overload

As a user with too much planned, I want TaskLaunch to suggest what can move so I do not have to manually rebalance everything.

### Protect Deadlines

As a user, I want important deadlines highlighted before they become urgent.

### Refresh After Change

As a user whose day changes, I want to regenerate the brief using the latest task state.

---

## 6. Primary User Flow

```text
User opens Dashboard
    ↓
TaskLaunch checks for a valid daily brief
    ↓
If missing or stale:
    Load eligible task and schedule context
    ↓
Calculate workload, deadline risk, and plan health
    ↓
Load current Next Best Action
    ↓
Generate proposed adjustments
    ↓
Optionally generate AI summary text
    ↓
Persist daily brief snapshot
    ↓
Display concise brief
    ↓
User can:
    Start recommended task
    Review overloaded items
    Review due-soon items
    Refresh brief
    Dismiss specific suggestions
```

---

## 7. Primary Interface

The Daily Executive Brief should appear near the top of the Dashboard.

Recommended structure:

```text
TODAY

You have about 85 minutes planned.
A more realistic target is 55–70 minutes.

Start with:
Prepare Play Store assets
Start here: Review the current screenshots.

Watch:
2 tasks are due within 3 days.

Suggested adjustment:
Move "Research notification providers" out of today.

[Start now] [Review today] [Refresh]
```

The brief should be collapsible after the user has reviewed it.

---

## 8. Brief Sections

The MVP brief may contain:

1. Day summary
2. Primary task
3. Next Best Action
4. Planned workload
5. Realistic workload range
6. Plan health
7. Deadline watch
8. Suggested adjustments
9. Optional behavioural observation
10. Refresh timestamp

Not every section must appear every day.

---

## 9. Plan Health

The system should calculate a deterministic plan-health state.

Suggested states:

```text
LIGHT
REALISTIC
SLIGHTLY_OVERLOADED
SIGNIFICANTLY_OVERLOADED
INSUFFICIENT_DATA
```

Example thresholds:

```text
planned <= realisticMax * 0.75
    → LIGHT

planned <= realisticMax
    → REALISTIC

planned <= realisticMax * 1.25
    → SLIGHTLY_OVERLOADED

planned > realisticMax * 1.25
    → SIGNIFICANTLY_OVERLOADED
```

Thresholds must be configurable.

---

## 10. Available Capacity Input

The MVP should use the best available capacity source in this order:

1. User-selected daily available minutes
2. Remaining focus-window time
3. Existing schedule availability
4. Historical weekday baseline, if already supported
5. Product default

Suggested source enum:

```text
USER_SELECTED
FOCUS_WINDOW
SCHEDULE
HISTORICAL_BASELINE
DEFAULT
```

The user must be able to override the calculated available time.

---

## 11. Realistic Workload Range

The brief should calculate a range rather than a single absolute value.

Example:

```text
Planned:
95 minutes

Realistic today:
60–75 minutes
```

The calculation should use deterministic inputs.

Potential factors:

- Available minutes
- Existing daily task goals
- Known task durations
- Remaining focus-window duration
- Completed work today
- Existing scheduled commitments
- Historical completion baseline, if already available

The MVP should avoid claiming psychological or physiological capacity.

---

## 12. Deadline Risk

The brief should classify deadline risk.

Suggested states:

```text
NO_RISK
DUE_SOON
AT_RISK
OVERDUE
```

Signals may include:

- Due date
- Remaining estimated work
- Remaining available days
- Current planned workload
- Task priority
- Task completion status

A deterministic risk score should be used.

---

## 13. Deadline Reason Codes

Suggested reason codes:

```text
DUE_TODAY
DUE_WITHIN_3_DAYS
OVERDUE
INSUFFICIENT_REMAINING_TIME
HIGH_PRIORITY_DEADLINE
MULTIPLE_DEADLINES_CLUSTERED
```

The UI should derive explanations from these codes.

---

## 14. Suggested Adjustments

The brief may propose a maximum of 3 adjustments.

Allowed MVP adjustment types:

```text
MOVE_OUT_OF_TODAY
REDUCE_TODAY_SCOPE
REVIEW_DEADLINE
CLARIFY_TASK
START_WITH_FIRST_ACTION
```

The MVP must not apply these automatically.

Example:

```text
Move "Research notification providers" out of today.
Reason: It is flexible and today is already overloaded.
```

---

## 15. Adjustment Eligibility

A task may be suggested for moving only if:

- It has no hard deadline today
- It is not high-priority and urgent
- It is not blocking an important task
- It is flexible under existing scheduling rules
- It is not already in progress
- It is not explicitly pinned by the user

The system must never suggest moving a hard-deadline task beyond its deadline.

---

## 16. Next Best Action Integration

The brief should reuse the existing Next Best Action service.

The Daily Executive Brief must not implement separate ranking logic.

Suggested section:

```text
Start with:
Prepare Play Store assets

Why:
Due soon, fits the time available, and already has a clear first action.
```

If no Next Best Action exists, omit this section.

---

## 17. Task Clarification Integration

If a high-priority task is vague or has no clear first action, the brief may suggest:

```text
Make this easier to start
```

The brief should use existing Task Clarification functionality rather than generating a new decomposition inline.

---

## 18. Daily Brief Reason Codes

Suggested stable reason codes:

```text
PLAN_LIGHT
PLAN_REALISTIC
PLAN_OVERLOADED
PLAN_SIGNIFICANTLY_OVERLOADED
DEADLINE_CLUSTER
DUE_SOON
OVERDUE_TASK_PRESENT
FOCUS_WINDOW_AVAILABLE
FOCUS_WINDOW_ENDING
AVAILABLE_TIME_LOW
FLEXIBLE_TASK_CAN_MOVE
TASK_NEEDS_CLARIFICATION
NEXT_BEST_ACTION_AVAILABLE
```

Reason codes should remain deterministic.

---

## 19. AI Role

AI may be used only to convert structured daily facts into concise natural language.

Example input:

```json
{
  "planHealth": "SLIGHTLY_OVERLOADED",
  "plannedMinutes": 95,
  "realisticRange": {
    "min": 60,
    "max": 75
  },
  "reasonCodes": [
    "PLAN_OVERLOADED",
    "DUE_SOON"
  ]
}
```

Example output:

```text
You have a little more planned than comfortably fits today. Start with the due-soon task, then consider moving one flexible item.
```

AI must not:

- Change workload calculations
- Change task ranking
- Invent deadlines
- Invent capacity reasons
- Add unsupported recommendations
- Modify tasks
- Change schedule state

A deterministic local summary must always be available.

---

## 20. Daily Brief Data Model

Suggested path:

```text
users/{userId}/dailyBriefs/{yyyy-mm-dd}
```

Suggested model:

```ts
export type PlanHealth =
  | "LIGHT"
  | "REALISTIC"
  | "SLIGHTLY_OVERLOADED"
  | "SIGNIFICANTLY_OVERLOADED"
  | "INSUFFICIENT_DATA";

export interface DailyExecutiveBrief {
  id: string;
  userId: string;
  localDate: string;

  plannedMinutes: number;
  completedMinutes: number;

  realisticRange: {
    min: number;
    max: number;
  };

  capacitySource:
    | "USER_SELECTED"
    | "FOCUS_WINDOW"
    | "SCHEDULE"
    | "HISTORICAL_BASELINE"
    | "DEFAULT";

  planHealth: PlanHealth;

  nextBestActionRecommendationId?: string | null;

  dueSoonTaskIds: string[];
  overdueTaskIds: string[];

  adjustments: DailyBriefAdjustment[];

  reasonCodes: DailyBriefReasonCode[];

  summaryText: string;

  generatedAt: string;
  expiresAt: string;
  sourceTaskVersionHash: string;
}
```

---

## 21. Adjustment Model

```ts
export interface DailyBriefAdjustment {
  id: string;
  type:
    | "MOVE_OUT_OF_TODAY"
    | "REDUCE_TODAY_SCOPE"
    | "REVIEW_DEADLINE"
    | "CLARIFY_TASK"
    | "START_WITH_FIRST_ACTION";

  taskId: string;
  reasonCodes: string[];
  explanation: string;
  status: "ACTIVE" | "DISMISSED" | "ACCEPTED";
}
```

For MVP, `ACCEPTED` may mean the user opened the relevant task action rather than an automatic mutation.

---

## 22. Brief Freshness

A brief should regenerate when:

- The local date changes
- A task is completed
- A task is added
- A due date materially changes
- Planned minutes materially change
- Available-time override changes
- Next Best Action changes
- User manually refreshes
- The brief exceeds its freshness window

Suggested freshness:

```text
15 minutes
```

Do not regenerate after every minor UI interaction.

---

## 23. API Contracts

### Get or Generate Brief

```http
POST /api/executive-brief/daily
```

Request:

```json
{
  "availableMinutesOverride": 70,
  "forceRefresh": false
}
```

Response:

```json
{
  "localDate": "2026-08-07",
  "plannedMinutes": 95,
  "completedMinutes": 20,
  "realisticRange": {
    "min": 60,
    "max": 75
  },
  "planHealth": "SLIGHTLY_OVERLOADED",
  "nextBestAction": {},
  "deadlineWatch": [],
  "adjustments": [],
  "summaryText": "You have slightly more planned than comfortably fits today."
}
```

### Refresh Brief

```http
POST /api/executive-brief/daily/refresh
```

### Dismiss Adjustment

```http
POST /api/executive-brief/daily/{briefId}/adjustments/{adjustmentId}/dismiss
```

---

## 24. Ownership and Security

Requirements:

- Briefs are user-scoped
- Server loads task context directly
- Client must not provide trusted task state
- Another user must not access or regenerate the brief
- Task content must not be included in analytics
- AI summarisation must receive only the minimum structured context needed

---

## 25. Failure Handling

### Brief Calculation Failure

Show:

```text
TaskLaunch could not build today’s brief right now.
```

Offer:

```text
Try again
View tasks
```

### AI Summary Failure

Do not fail the brief.

Use deterministic summary templates.

### No Tasks

Show:

```text
You have nothing planned right now.
```

### Insufficient Data

Show:

```text
There is not enough information to estimate today’s workload yet.
```

Do not guess.

---

## 26. Analytics Events

Do not include task titles, notes, or raw brief text.

Track:

```text
daily_brief_generated
daily_brief_viewed
daily_brief_refreshed
daily_brief_next_action_started
daily_brief_adjustment_viewed
daily_brief_adjustment_dismissed
daily_brief_available_time_changed
daily_brief_generation_failed
daily_brief_no_tasks
```

Safe properties:

- Plan health
- Planned-minutes bucket
- Realistic-range bucket
- Capacity source
- Due-soon task count
- Overdue task count
- Adjustment count
- Whether Next Best Action exists
- Latency
- AI-summary used or fallback used

---

## 27. Success Metrics

Primary metric:

> Percentage of Daily Executive Brief views followed by a task session starting within 15 minutes.

Supporting metrics:

- Brief view rate
- Start-from-brief rate
- Adjustment interaction rate
- Refresh rate
- Available-time override rate
- Plan-health distribution
- Planned-versus-completed workload accuracy
- Overloaded-day completion rate
- Due-soon task completion rate
- AI fallback rate

---

## 28. Guardrail Metrics

Monitor:

- Incorrect overload classification
- Hard-deadline tasks suggested for moving
- Cross-user brief exposure
- Task content in analytics
- AI summary introducing unsupported facts
- Excessive regeneration frequency
- Brief calculation latency
- High adjustment dismissal rate
- Capacity claims framed as medical or psychological facts

Any recommendation to move a hard-deadline task beyond its deadline is a critical defect.

---

## 29. Accessibility Requirements

The Daily Executive Brief must support:

- Keyboard navigation
- Screen readers
- Clear heading hierarchy
- Large touch targets
- Accessible refresh control
- No colour-only plan-health indication
- Reduced motion
- Clear loading announcements
- Clear stale-state announcements
- Accessible collapsed/expanded states

---

## 30. Performance Targets

| Operation | Target |
|---|---:|
| Deterministic brief calculation | Under 500 ms |
| Cached brief load | Under 300 ms |
| Full server response | Under 1 second without AI summary |
| AI-enhanced summary | Under 3 seconds |
| Manual refresh | Under 1 second without AI summary |

The UI should render deterministic content before waiting for optional AI summary text.

---

## 31. MVP Scope

### Included

- Dashboard Daily Executive Brief
- Planned workload calculation
- Completed workload calculation
- Realistic workload range
- Plan-health state
- Next Best Action integration
- Deadline watch
- Up to three suggested adjustments
- Available-time override
- Deterministic reason codes
- Local summary fallback
- Optional AI summarisation
- Refresh
- Adjustment dismissal
- Brief persistence
- Freshness checks
- Analytics
- Unit, integration, and end-to-end tests

### Excluded

- Automatic schedule mutations
- Adaptive capacity inference
- Calendar integration
- Push notifications
- Full weekly planning
- Recovery Mode
- Behavioural machine learning
- Proactive background regeneration
- Wearable or health signals

---

## 32. Phase Two Scope

Phase Two may introduce:

- Adaptive Daily Capacity
- User-specific historical capacity baselines
- Schedule Repair
- One-tap acceptance of safe plan adjustments
- Weekly Executive Review
- Recovery Mode
- Context-aware notifications
- Calendar availability integration
- Work/home profile separation

---

## 33. Ordered Build Plan

### Phase 1: Daily Planning Foundation

1. Define daily brief contract
2. Define plan-health enum
3. Define capacity-source precedence
4. Implement planned-workload calculation
5. Implement completed-work calculation
6. Implement realistic-range calculation
7. Implement deadline-risk logic
8. Implement adjustment eligibility
9. Define reason codes
10. Add deterministic tests

Completion condition:

```text
A deterministic service can calculate plan health, workload range, deadline risk, and suggested adjustments for an owned task set.
```

### Phase 2: Brief API and Persistence

1. Add authenticated daily-brief endpoint
2. Load task data server-side
3. Integrate Next Best Action
4. Persist daily brief snapshot
5. Add freshness checks
6. Add source-task version hash
7. Add no-task and insufficient-data responses
8. Add deterministic summary templates
9. Add optional AI summary adapter
10. Add API and ownership tests

### Phase 3: Dashboard Experience

1. Add Daily Executive Brief card
2. Add plan-health display
3. Add workload summary
4. Add Next Best Action section
5. Add deadline-watch section
6. Add suggested-adjustments section
7. Add available-time override
8. Add refresh
9. Add responsive layout
10. Add accessibility coverage

### Phase 4: Outcome Tracking and Hardening

1. Record brief views
2. Record starts from brief
3. Record adjustment interactions
4. Add stale-state handling
5. Add manual-refresh handling
6. Add AI fallback tests
7. Add telemetry redaction tests
8. Add end-to-end tests
9. Add guardrail tests
10. Add evaluation fixtures

---

## 34. Testing Requirements

### Unit Tests

Cover:

- Planned workload
- Completed workload
- Realistic workload range
- Plan-health thresholds
- Capacity-source precedence
- Deadline-risk classification
- Adjustment eligibility
- Hard-deadline protection
- Reason-code generation
- Deterministic summary templates

### Integration Tests

Cover:

- Owned brief generation
- Cross-user access denial
- Next Best Action integration
- Freshness invalidation
- Task-change invalidation
- No-task response
- Insufficient-data response
- Analytics redaction

### End-to-End Tests

1. Dashboard displays today’s brief
2. Overloaded day shows overload state
3. Realistic day shows realistic state
4. Due-soon tasks appear in deadline watch
5. Hard-deadline tasks are never suggested for moving
6. Start action launches current Next Best Action
7. Available-time override changes plan health
8. Refresh regenerates stale content
9. AI summary failure uses deterministic fallback
10. Cross-user brief access is blocked

---

## 35. Deterministic Evaluation Fixtures

Create at least 100 daily planning fixtures.

Include:

- Empty day
- Light day
- Realistic day
- Slightly overloaded day
- Significantly overloaded day
- Multiple due-today tasks
- Due-soon clusters
- Overdue tasks
- Unknown durations
- No focus window
- Short remaining focus window
- Flexible tasks
- Hard-deadline tasks
- Tasks with Next Best Action
- Tasks requiring clarification

Validate:

- Correct plan-health state
- Correct workload range
- Correct deadline-risk classification
- Safe adjustment suggestions
- Stable reason codes
- No unsafe move suggestions

---

## 36. Recommended Product Copy

### Heading

```text
Today
```

### Plan Health

```text
Your plan looks realistic.
```

```text
You have a little more planned than comfortably fits today.
```

```text
Today looks overloaded. A few flexible tasks can move.
```

### Primary Action

```text
Start with
```

### Deadline Section

```text
Watch
```

### Adjustment Section

```text
Suggested adjustment
```

### Refresh

```text
Refresh brief
```

### No Tasks

```text
You have nothing planned right now.
```

---

## 37. Codex Implementation Rules

1. Inspect the existing Dashboard, task scheduling, Next Best Action, focus-window, history, and task-duration implementations before coding.
2. Reuse the current Next Best Action service rather than reimplementing ranking.
3. Keep workload, plan-health, deadline-risk, and adjustment eligibility deterministic.
4. Do not let AI change calculations or suggested task IDs.
5. Keep thresholds and weights configurable.
6. Do not modify tasks in the MVP.
7. Do not move tasks automatically.
8. Protect hard deadlines with deterministic rules.
9. Do not expose task content in analytics or logs.
10. Use a deterministic summary fallback.
11. Add one failing public-interface test before each behaviour.
12. Mock only external boundaries such as Firebase, AI provider, network, and time.
13. Preserve Dashboard functionality when the brief fails.
14. Do not implement Adaptive Daily Capacity or Schedule Repair yet.
15. Document deviations from this PRD.

---

## 38. Definition of Done

The MVP is complete when:

- Dashboard displays a Daily Executive Brief
- Planned and completed workload are calculated deterministically
- Realistic workload range is available
- Plan health is classified correctly
- Next Best Action is integrated
- Due-soon and overdue tasks are surfaced
- Up to three safe adjustments may be suggested
- Hard-deadline tasks are protected
- Available-time override works
- Refresh and freshness handling work
- AI failure falls back to deterministic summary text
- Cross-user access is prevented
- Analytics exclude task content
- Unit, integration, and end-to-end tests pass

---

## 39. Recommended First Codex Task

```text
Build the TaskLaunch Daily Executive Brief calculation foundation.

Requirements:
- Inspect the existing Dashboard, task scheduling, Next Best Action service, task durations, focus-window logic, and history data.
- Define the Daily Executive Brief contract.
- Define plan-health and deadline-risk enums.
- Implement deterministic planned-workload and completed-work calculations.
- Implement realistic workload range calculation using existing supported data.
- Implement plan-health classification.
- Implement deadline-risk detection.
- Implement safe adjustment eligibility with hard-deadline protection.
- Define stable reason codes.
- Do not build the Dashboard UI yet.
- Do not use the AI provider for calculations.
- Add unit tests for plan health, deadline risk, workload range, hard-deadline protection, and adjustment eligibility.
- Follow incremental TDD.
```
