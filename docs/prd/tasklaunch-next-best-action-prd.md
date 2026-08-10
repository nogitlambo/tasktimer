# TaskLaunch Next Best Action

## Product Requirements Document

**Status:** Draft for implementation  
**Product:** TaskLaunch  
**Feature:** Next Best Action  
**Parent capability:** Executive Function Engine  
**Preceding features:** Intelligent Brain Dump; AI Task Clarification and Decomposition  
**Target platforms:** Responsive web and Android-compatible web UI  
**Primary stack:** Next.js, React, TypeScript, Firebase Authentication, Firestore, hosted server API, OpenAI API, Zod  
**Primary objective:** Recommend one practical task or first action that best fits the user’s current context, available time, priorities, deadlines, focus window, and recent task history.

---

## 1. Product Summary

Next Best Action is the first recommendation layer in the TaskLaunch Executive Function Engine.

Instead of requiring the user to scan a task list, compare deadlines, estimate effort, and decide what to do next, TaskLaunch should select a single recommended action and explain why it is a good fit right now.

The recommendation should combine:

- Deterministic task-ranking logic
- Existing TaskLaunch scheduling data
- Explicit task priority
- Due dates
- Available time
- Task duration
- Focus-window alignment
- Postponement history
- Task clarification metadata
- Existing first-action suggestions where available
- Optional AI-generated explanation text

The system must not delegate critical ranking constraints entirely to an LLM.

The core principle is:

> TaskLaunch should make the next decision smaller.

---

## 2. Product Principle

> Recommend one useful action, not another list to manage.

The feature should reduce decision fatigue by presenting one primary recommendation with a small number of alternatives only when necessary.

The experience must remain:

- Fast
- Explainable
- Reversible
- Nonjudgmental
- Deterministic at its core
- Personalised where evidence supports it
- Useful even if the AI provider is unavailable

---

## 3. Problem Statement

Even after users capture and clarify tasks, they still have to decide:

- Which task is most important
- Which deadline matters most
- What fits the time available
- Which task suits the current focus window
- Whether a repeatedly postponed task should be prioritised
- Whether a task is blocked
- Whether the current task duration is realistic

This decision step itself creates executive friction.

TaskLaunch should convert task context into a single actionable recommendation.

---

## 4. Goals

### 4.1 Primary Goals

The feature must:

- Recommend one primary task or first action
- Use deterministic ranking rules as the core selection mechanism
- Respect deadlines and explicit priority
- Consider available time and task duration
- Consider focus-window alignment
- Consider postponement history where available
- Prefer clarified first actions where they improve initiation
- Exclude blocked or ineligible tasks
- Explain the recommendation concisely
- Allow the user to request an alternative
- Allow the user to start the task directly
- Record recommendation outcomes for later personalisation
- Continue to function without an AI provider

### 4.2 Secondary Goals

The feature should:

- Reduce time between opening TaskLaunch and starting work
- Improve completion of repeatedly postponed tasks
- Improve use of existing focus windows
- Improve future duration estimates
- Generate feedback data for adaptive recommendations
- Provide a foundation for Daily Executive Brief
- Provide a foundation for Adaptive Daily Capacity
- Provide a foundation for Schedule Repair

### 4.3 Non-Goals

The MVP will not:

- Automatically start tasks
- Automatically reschedule tasks
- Change deadlines
- Reorder the entire task list
- Infer emotional or medical state
- Use a general-purpose chatbot
- Continuously monitor device activity
- Use calendar integrations
- Use wearable or health data
- Generate a full-day plan
- Automatically hide tasks without user control
- Use reinforcement-learning-style personalisation

---

## 5. Core User Stories

### Decide What to Do

As a user with several valid tasks, I want TaskLaunch to recommend one task so that I do not have to decide where to start.

### Understand Why

As a user receiving a recommendation, I want a concise explanation so that I can trust or reject it.

### Start Immediately

As a user who accepts the recommendation, I want to start the task timer directly.

### Get an Alternative

As a user who does not want the recommended task, I want one alternative without being forced back into the full task list.

### Fit Available Time

As a user with limited time, I want TaskLaunch to recommend something that realistically fits the time I have available.

### Avoid Blocked Work

As a user, I do not want TaskLaunch to recommend a task that cannot currently be acted on.

---

## 6. Primary User Flow

```text
User opens Dashboard or Tasks
    ↓
TaskLaunch loads eligible tasks
    ↓
Deterministic ranking engine scores candidates
    ↓
Highest-scoring task becomes primary recommendation
    ↓
Optional AI layer generates concise explanation
    ↓
Recommendation card is displayed
    ↓
User chooses:
    Start now
    Alternative
    Not now
    Why this?
    ↓
Outcome is recorded
    ↓
If started, existing TaskLaunch timer flow begins
```

---

## 7. Primary Interface

The MVP should expose Next Best Action primarily on the Dashboard.

Recommended card structure:

```text
NEXT BEST ACTION

Prepare Play Store assets

Start here:
Review the current screenshots and list anything missing.

Estimated time:
15–20 min

Why this:
Due soon, fits your current focus window, and has been postponed twice.

[Start now] [Alternative]
```

Secondary access may be added from the Tasks page.

The MVP should not show multiple ranked recommendations simultaneously by default.

---

## 8. Recommendation Output

Each recommendation should contain:

- Task ID
- Task title
- First action, if available
- Estimated duration
- Due-date context
- Primary reason
- Secondary reasons
- Recommendation score
- Confidence band
- Source of recommendation
- Generated timestamp
- Expiry timestamp

Example:

```json
{
  "taskId": "task_123",
  "title": "Prepare Play Store assets",
  "firstAction": "Review the current screenshots",
  "estimatedMinutes": 20,
  "reasonCodes": [
    "DUE_SOON",
    "FITS_AVAILABLE_TIME",
    "MATCHES_FOCUS_WINDOW",
    "FREQUENTLY_POSTPONED"
  ],
  "score": 82,
  "confidence": "HIGH"
}
```

---

## 9. Eligibility Rules

A task may be considered only if:

- It belongs to the authenticated user
- It is active
- It is not deleted
- It is not completed
- It is not explicitly blocked
- It is actionable now
- It is not outside a hard date restriction
- It is compatible with current TaskLaunch availability rules
- It is not already running in another incompatible session
- It is not excluded by the user

If no eligible task exists, TaskLaunch should not fabricate one.

Suggested empty state:

```text
Nothing needs your attention right now.
```

---

## 10. Deterministic Ranking Model

The MVP ranking engine should use a weighted score.

The exact weights should be configurable.

Suggested initial model:

| Signal | Suggested Weight |
|---|---:|
| Due today | +40 |
| Due within 3 days | +25 |
| High explicit priority | +25 |
| Medium explicit priority | +10 |
| Fits available time | +20 |
| Matches current focus window | +15 |
| Has a clarified first action | +10 |
| Postponed 2+ times | +10 |
| Blocks another important task | +15 |
| Recently started but incomplete | +8 |
| Duration uncertainty high | -5 |
| Exceeds available time | -25 |
| Explicitly blocked | Exclude |
| Completed | Exclude |
| Deferred until future date | Exclude |

The scoring system must be implemented in deterministic application code.

---

## 11. Ranking Formula

```text
score =
  deadlineScore
  + priorityScore
  + durationFitScore
  + focusWindowScore
  + firstActionScore
  + postponementScore
  + dependencyScore
  + continuationScore
  - uncertaintyPenalty
  - durationMismatchPenalty
```

The ranking engine should return both:

```text
score
reasonCodes
```

The UI explanation should derive from reason codes rather than unrestricted model interpretation.

---

## 12. Reason Codes

Supported MVP reason codes:

```text
DUE_TODAY
DUE_SOON
HIGH_PRIORITY
MEDIUM_PRIORITY
FITS_AVAILABLE_TIME
MATCHES_FOCUS_WINDOW
HAS_CLEAR_FIRST_ACTION
FREQUENTLY_POSTPONED
BLOCKS_OTHER_WORK
RECENTLY_STARTED
QUICK_WIN
LONG_FOCUS_FIT
LOW_DURATION_CONFIDENCE
EXCEEDS_AVAILABLE_TIME
USER_PREFERENCE_MATCH
```

Reason codes must be stable application-level values.

---

## 13. Available-Time Input

The recommendation engine should support an optional user-selected available-time window.

Examples:

```text
I have 10 minutes
I have 20 minutes
I have 30 minutes
I have 1 hour
Use my current focus window
```

For MVP, expose compact controls:

```text
[10m] [20m] [30m] [60m] [Any]
```

The selected duration should influence ranking immediately.

---

## 14. Focus Window Integration

If TaskLaunch already has a configured productivity/focus window, use it as a ranking signal.

The engine should:

- Prefer tasks that suit the current focus window
- Not exclude all work outside the focus window
- Avoid treating focus-window mismatch as a failure
- Allow high-priority deadlines to override soft focus preferences

Focus-window alignment should remain a soft score, not a hard rule.

---

## 15. Task Duration Handling

Use the best available duration source in this order:

1. User-confirmed task duration
2. Historical duration estimate
3. Clarification/decomposition estimate
4. Existing task goal
5. Fallback duration category

Suggested enum:

```text
USER_CONFIRMED
HISTORICAL
AI_CLARIFICATION
TASK_GOAL
DEFAULT
```

If duration is unknown, do not automatically exclude the task.

---

## 16. First Action Integration

If a task has an accepted or available first action from Task Clarification, display it prominently.

Example:

```text
Task:
Prepare app release

Start here:
Open the Play Console release checklist
```

If no first action exists:

- Display the task title only
- Optionally provide a “Make this easier to start” action
- Do not generate a new first action silently in the ranking engine

---

## 17. Alternative Recommendation

The user may select:

```text
Alternative
```

The system should return the next-highest eligible task.

Requirements:

- Do not repeatedly recommend the same task in the same recommendation session
- Record the primary task as skipped, not rejected globally
- Provide at most 3 alternatives per recommendation session in MVP
- After 3 alternatives, show the task list

---

## 18. Dismissal and Feedback

The user may choose:

```text
Not now
```

Optional feedback:

```text
Wrong timing
Too big right now
Not important
Blocked
Already handled
Just not today
```

Feedback should initially be recorded for analysis only.

The MVP should not automatically rewrite model weights per user.

---

## 19. Explainability

Each recommendation should provide a concise explanation based on deterministic reason codes.

Example:

```text
Due tomorrow, fits the 20 minutes you have available, and already has a clear first step.
```

The explanation may be generated locally from templates or rephrased by a lightweight AI model.

The deterministic reason codes remain the source of truth.

If AI explanation generation fails, use a local template.

---

## 20. AI Role

AI should not select the task in MVP.

AI may be used for:

- Rephrasing deterministic reason codes into natural language
- Compressing a long explanation
- Producing a neutral user-facing summary

AI must not:

- Override deterministic eligibility
- Change task priority
- Invent deadlines
- Invent behavioural history
- Change the ranking score
- Introduce unsupported reasons

---

## 21. Recommendation Data Model

Suggested path:

```text
users/{userId}/recommendations/{recommendationId}
```

Suggested model:

```ts
export type NextBestActionStatus =
  | "ACTIVE"
  | "STARTED"
  | "SKIPPED"
  | "DISMISSED"
  | "EXPIRED";

export interface NextBestActionRecommendation {
  id: string;
  userId: string;
  taskId: string;
  taskVersion: string;
  score: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  reasonCodes: NextBestActionReasonCode[];
  availableMinutes?: number | null;
  focusWindowMatched: boolean;
  durationMinutes?: number | null;
  durationSource?: DurationEstimateSource | null;
  firstAction?: string | null;
  status: NextBestActionStatus;
  alternativeIndex: number;
  createdAt: string;
  expiresAt: string;
  startedAt?: string | null;
  dismissedAt?: string | null;
  feedbackCode?: string | null;
}
```

---

## 22. API Contracts

### Get Recommendation

```http
POST /api/recommendations/next-best-action
```

Request:

```json
{
  "availableMinutes": 20,
  "excludeTaskIds": []
}
```

Response:

```json
{
  "recommendationId": "rec_123",
  "taskId": "task_456",
  "title": "Prepare Play Store assets",
  "firstAction": "Review the current screenshots",
  "estimatedMinutes": 20,
  "score": 82,
  "confidence": "HIGH",
  "reasonCodes": [
    "DUE_SOON",
    "FITS_AVAILABLE_TIME",
    "MATCHES_FOCUS_WINDOW"
  ],
  "explanation": "Due soon and a good fit for the 20 minutes you have available."
}
```

### Request Alternative

```http
POST /api/recommendations/next-best-action/{recommendationId}/alternative
```

### Dismiss Recommendation

```http
POST /api/recommendations/next-best-action/{recommendationId}/dismiss
```

### Start Recommendation

```http
POST /api/recommendations/next-best-action/{recommendationId}/start
```

The start endpoint should hand off to the existing TaskLaunch timer/session path.

---

## 23. Confidence Model

Confidence describes ranking quality, not task importance.

High confidence:
- Multiple strong signals agree
- Duration is known
- Task is clearly eligible

Medium confidence:
- Recommendation is valid but based on fewer signals
- Duration may be estimated

Low confidence:
- Metadata is limited
- Multiple candidates have nearly identical scores
- Duration is unknown

Low confidence should not prevent recommendation.

---

## 24. Recommendation Expiry

Suggested MVP expiry:

```text
30 minutes
```

Regenerate if:

- Task data changes
- User completes the task
- User changes available time
- Current focus window changes materially
- Recommendation expires

---

## 25. Ownership and Security

Requirements:

- Recommendations are user-scoped
- Only the authenticated user may request recommendations
- Only owned/accessible tasks may be considered
- Server-side ranking must load task data directly
- Client-provided task metadata must not be trusted
- Recommendation mutations must verify ownership
- No task content should appear in analytics

---

## 26. Failure Handling

### Ranking Failure

```text
TaskLaunch could not choose a recommendation right now.
```

Offer:

```text
View tasks
Try again
```

### AI Explanation Failure

Do not fail the recommendation. Use a deterministic template.

### No Eligible Tasks

```text
Nothing needs your attention right now.
```

### Stale Recommendation

```text
This recommendation is out of date. TaskLaunch has refreshed it.
```

---

## 27. Analytics Events

Do not include task titles or notes.

Track:

```text
next_best_action_viewed
next_best_action_generated
next_best_action_started
next_best_action_alternative_requested
next_best_action_dismissed
next_best_action_expired
next_best_action_feedback_submitted
next_best_action_no_eligible_tasks
next_best_action_generation_failed
```

Safe properties:

- Score band
- Confidence band
- Reason codes
- Available-time bucket
- Duration bucket
- Focus-window match
- Alternative index
- Whether task had first action
- Recommendation latency

---

## 28. Success Metrics

Primary metric:

> Percentage of displayed recommendations that result in a task session starting within 10 minutes.

Supporting metrics:

- Recommendation start rate
- Alternative request rate
- Dismissal rate
- Time from display to session start
- Completion rate of recommended tasks
- Postponed-task start rate
- Focus-window recommendation start rate
- Recommendation expiry rate
- No-eligible-task rate

---

## 29. Guardrail Metrics

Monitor:

- Blocked tasks being recommended
- Completed tasks being recommended
- Tasks outside hard restrictions being recommended
- Cross-user task exposure
- Repeated same-task alternatives
- Incorrect deadline reasoning
- Explanation reasons not present in reason codes
- High dismissal rate
- Task content appearing in analytics or logs

Any cross-user task exposure is a critical defect.

---

## 30. Performance Targets

| Operation | Target |
|---|---:|
| Deterministic ranking | Under 300 ms |
| Full recommendation response | Under 1 second without AI explanation |
| AI-enhanced explanation | Under 3 seconds |
| Alternative recommendation | Under 500 ms |
| Start handoff | Under 1 second |

---

## 31. MVP Scope

### Included

- Dashboard Next Best Action card
- Deterministic eligibility and scoring
- Available-time selector
- Deadline weighting
- Priority weighting
- Duration-fit weighting
- Focus-window weighting
- Postponement weighting
- First-action bonus
- Reason codes
- Local explanation fallback
- Optional AI explanation
- Start now
- Up to three alternatives
- Not now
- Feedback capture
- Recommendation persistence
- Expiry
- Ownership validation
- Analytics
- Unit, integration, and end-to-end tests

### Excluded

- Automatic schedule repair
- Daily planning
- Adaptive capacity
- Calendar integration
- Proactive notifications
- Behavioural machine learning
- Auto-hiding tasks
- Emotional-state inference
- Continuous recommendation monitoring

---

## 32. Ordered Build Plan

### Phase 1: Ranking Foundation

1. Define eligible task contract
2. Define reason-code enum
3. Define ranking configuration
4. Implement deterministic scoring service
5. Add exclusion logic
6. Add duration-source selection
7. Add focus-window scoring
8. Add postponement scoring
9. Add ranking tests
10. Add recommendation persistence schema

Completion condition:

```text
A deterministic service can rank owned eligible tasks and return one scored recommendation with reason codes.
```

### Phase 2: Recommendation API

1. Add authenticated recommendation endpoint
2. Load task candidates server-side
3. Apply ranking service
4. Persist recommendation
5. Add expiry
6. Add no-eligible-task response
7. Add local explanation templates
8. Add optional AI explanation adapter
9. Add API tests
10. Add redacted telemetry

### Phase 3: Dashboard Experience

1. Add Dashboard recommendation card
2. Add available-time selector
3. Add loading state
4. Add Start now
5. Add Alternative
6. Add Not now
7. Add Why this
8. Integrate first action
9. Add responsive/mobile styling
10. Add accessibility coverage

### Phase 4: Outcome Tracking

1. Record started recommendations
2. Record alternatives
3. Record dismissals
4. Add optional feedback
5. Connect start action to existing session flow
6. Add stale recommendation refresh
7. Add expiry handling
8. Add end-to-end tests
9. Add guardrail tests
10. Add metrics hooks

---

## 33. Testing Requirements

### Unit Tests

Cover:

- Eligibility
- Deadline scoring
- Priority scoring
- Duration-fit scoring
- Focus-window scoring
- Postponement scoring
- Exclusion rules
- Reason-code generation
- Tie-breaking
- Duration-source selection
- Explanation templates

### Integration Tests

Cover:

- Owned task candidate loading
- Cross-user exclusion
- Recommendation persistence
- Expiry
- Alternative exclusion
- Stale recommendation handling
- Start outcome recording
- Analytics redaction

### End-to-End Tests

1. Dashboard displays a recommendation
2. Due-soon task outranks low-priority flexible task
3. Blocked task is excluded
4. Available-time selector changes recommendation
5. Alternative does not repeat the primary task
6. Start now launches existing task flow
7. Dismissal records outcome
8. Stale recommendation refreshes
9. No eligible tasks shows empty state
10. AI explanation failure falls back cleanly

---

## 34. Tie-Breaking Rules

When two tasks have equal scores:

1. Earlier hard deadline
2. Higher explicit priority
3. Shorter known duration
4. Older task creation date
5. Stable task ID ordering

Never use random ordering in MVP.

---

## 35. Recommended Product Copy

### Card Heading

```text
Next Best Action
```

### Start Label

```text
Start now
```

### Alternative

```text
Alternative
```

### Explanation

```text
Why this?
```

### Dismiss

```text
Not now
```

### Time Selector

```text
How much time do you have?
```

### Empty State

```text
Nothing needs your attention right now.
```

---

## 36. Codex Implementation Rules

1. Inspect the existing task, scheduling, timer, focus-window, and history implementations before coding.
2. Reuse current TaskLaunch services and selectors.
3. Keep ranking deterministic.
4. Do not use an LLM to decide eligibility or score.
5. Store reason codes alongside the score.
6. Keep ranking weights configurable.
7. Do not expose task content in logs or analytics.
8. Do not modify task data from the recommendation engine.
9. Start actions must use the existing session/timer path.
10. Alternatives must exclude already shown tasks.
11. Add one failing public-interface test before each behaviour.
12. Mock only external boundaries such as Firebase, AI provider, network, and time.
13. Preserve functionality when AI explanation is unavailable.
14. Do not implement schedule repair or adaptive capacity in this feature.
15. Document deviations from this PRD.

---

## 37. Definition of Done

The MVP is complete when:

- Dashboard can display one Next Best Action
- Ranking is deterministic and tested
- Blocked/ineligible tasks are excluded
- Deadline, priority, duration, focus, postponement, and first-action signals are supported
- Available-time selection affects ranking
- Explanation derives from deterministic reason codes
- Start now uses the existing timer/session flow
- Alternatives do not repeat tasks
- Dismissal and feedback are recorded
- Recommendations expire safely
- Cross-user access is prevented
- AI failure does not break recommendation generation
- Analytics exclude task content
- Unit, integration, and end-to-end tests pass

---

## 38. Recommended First Codex Task

```text
Build the TaskLaunch Next Best Action ranking foundation.

Requirements:
- Inspect the current Task model, scheduling rules, focus-window logic, timer/session flow, postponement/history data, and clarified-task metadata.
- Define the eligible-task contract.
- Define stable reason codes.
- Implement a deterministic configurable scoring service.
- Include deadline, priority, available-time fit, focus-window match, postponement history, and clarified-first-action signals.
- Exclude completed, deleted, blocked, and currently ineligible tasks.
- Return ranked candidates with score and reason codes.
- Add deterministic tie-breaking.
- Do not build the Dashboard UI yet.
- Do not use the AI provider for ranking.
- Add unit tests for ranking, exclusions, tie-breaking, and reason-code generation.
- Follow incremental TDD.
```
