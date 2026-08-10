# TaskLaunch Adaptive Daily Capacity

## Product Requirements Document

**Status:** Draft for implementation  
**Product:** TaskLaunch  
**Feature:** Adaptive Daily Capacity  
**Parent capability:** Executive Function Engine  
**Preceding core features:** Intelligent Brain Dump; AI Task Clarification and Decomposition; Next Best Action; Daily Executive Brief  
**Target platforms:** Responsive web and Android-compatible web UI  
**Primary stack:** Next.js, React, TypeScript, Firebase Authentication, Firestore, hosted server API, Zod  
**Primary objective:** Estimate a realistic range of focused task work for the current day using observable TaskLaunch activity and scheduling data, while preserving user control and avoiding medical, emotional, or psychological inference.

---

## 1. Product Summary

Adaptive Daily Capacity estimates how much task work is realistically achievable for the user on the current day.

The feature becomes the authoritative capacity source for the Executive Function Engine and should answer:

- How much work is realistic today?
- How much capacity remains after work already completed?
- Is the estimate based on strong personal data or a fallback?
- Does the user have less or more time available than usual?
- Should Daily Executive Brief classify the day as overloaded?
- Does a candidate task fit the user's remaining capacity?
- Has the user explicitly overridden the estimate?

The output must be a range rather than a rigid quota.

Example:

```text
Today's capacity

Estimated remaining:
55–75 min

Based on:
• your recent Friday completion range
• 90 minutes remaining in your focus window
• 20 minutes already completed today

[Adjust]
```

Adaptive Daily Capacity is a planning service. It must not diagnose fatigue, burnout, mood, ADHD severity, executive dysfunction, sleep quality, or any health condition.

---

## 2. Product Principle

> Estimate workload capacity from observable work patterns, not assumptions about the person.

The feature must remain:

- Neutral
- Explainable
- User-adjustable
- Deterministic at its core
- Conservative when data is limited
- Privacy-conscious
- Non-medical
- Useful without AI
- Compatible with existing TaskLaunch scheduling and history data

---

## 3. Problem Statement

Static productivity systems often assume that a user's ability to complete work is roughly constant from one day to the next.

In reality, practical task capacity varies because of:

- Different available time
- Different focus-window length
- Work already completed
- Day-of-week patterns
- Existing schedule constraints
- Task-duration mix
- Recent completion history
- Manually reduced availability
- Interrupted or shortened workdays

Without a capacity layer, TaskLaunch may:

- Classify realistic plans as overloaded
- Classify overloaded plans as realistic
- Recommend tasks that do not fit the time remaining
- Push flexible work into already constrained days
- Overestimate how much remains after substantial work has already been completed
- Use static defaults long after enough historical data exists to personalise the estimate

Adaptive Daily Capacity should convert existing behavioural and scheduling data into a realistic workload range.

---

## 4. Goals

### 4.1 Primary Goals

The feature must:

- Estimate a realistic full-day workload range
- Estimate remaining workload capacity
- Use deterministic calculations
- Prefer explicit user input over inferred capacity
- Respect hard available-time ceilings
- Consider focus-window duration
- Consider work already completed today
- Consider historical completion data when sufficient
- Consider weekday-specific patterns when reliable
- Produce a confidence level
- Expose the signals used in the estimate
- Allow manual override
- Integrate with Daily Executive Brief
- Integrate with Next Best Action duration-fit logic
- Avoid medical, emotional, or physiological inference

### 4.2 Secondary Goals

The feature should:

- Improve overloaded-day detection
- Improve planned-versus-completed workload accuracy
- Reduce unnecessary task carry-over
- Improve duration-fit recommendations
- Support future Schedule Repair
- Support future Recovery Mode
- Support future workload forecasting
- Provide a reusable behavioural aggregate for future Executive Function features

### 4.3 Non-Goals

The MVP will not:

- Read sleep data
- Read heart-rate or wearable data
- Infer mood
- Infer burnout
- Infer depression
- Infer ADHD symptom severity
- Read calendar integrations
- Automatically reduce task goals
- Automatically move tasks
- Automatically suppress notifications
- Use reinforcement learning
- Monitor passive phone activity
- Use voice-emotion analysis
- Use an LLM to calculate capacity

---

## 5. Core User Stories

### Know What Is Realistic

As a user, I want TaskLaunch to estimate a realistic amount of work for today so I do not over-plan.

### Override the Estimate

As a user, I want to tell TaskLaunch that today is lighter or stronger than usual so the app respects my own judgement.

### Understand the Estimate

As a user, I want to know what signals contributed to the estimate so I can decide whether it makes sense.

### Adapt During the Day

As a user, I want the estimate to update when I complete work or my available time changes.

### Work With Limited Data

As a new user, I want TaskLaunch to remain useful before enough history exists for personalisation.

---

## 6. Primary User Flow

```text
User opens Dashboard
    ↓
TaskLaunch loads today's capacity snapshot
    ↓
If valid and fresh:
    use cached estimate
Else:
    gather supported capacity signals
    ↓
calculate baseline range
    ↓
apply manual override if present
    ↓
apply hard available-time ceiling
    ↓
subtract completed work
    ↓
calculate confidence
    ↓
persist capacity snapshot
    ↓
Daily Executive Brief consumes remaining range
    ↓
Next Best Action consumes duration-fit context
    ↓
User may adjust capacity
    ↓
Dependent recommendations refresh
```

---

## 7. Capacity Output

The core output must include:

- Full-day minimum minutes
- Full-day maximum minutes
- Remaining minimum minutes
- Remaining maximum minutes
- Capacity state
- Confidence
- Capacity source
- Source signals
- Available-time ceiling
- Completed minutes today
- Manual override status
- Historical sample size
- Generated timestamp
- Expiry timestamp

Example:

```json
{
  "fullDayRange": { "min": 70, "max": 95 },
  "remainingRange": { "min": 50, "max": 75 },
  "state": "STANDARD",
  "confidence": "MEDIUM",
  "completedMinutesToday": 20,
  "availableMinutesCeiling": 90,
  "sourceSignals": [
    "WEEKDAY_HISTORY",
    "FOCUS_WINDOW_REMAINING",
    "TODAY_COMPLETED_WORK"
  ],
  "manualOverride": null,
  "historicalSampleSize": 8
}
```

---

## 8. Capacity States

Use neutral planning labels:

```text
REDUCED
LIGHT
STANDARD
STRONG
USER_DEFINED
INSUFFICIENT_DATA
```

These labels describe planning capacity only.

Preferred:

```text
A lighter workload looks more realistic today.
```

Avoid:

```text
You seem tired today.
You may be burned out.
Your ADHD symptoms appear worse today.
```

---

## 9. Input Precedence

Use this precedence:

1. Explicit user-defined custom minutes
2. Explicit user-selected capacity state
3. Hard available-time ceiling
4. Remaining focus-window availability
5. Existing schedule availability
6. Weekday-specific historical range
7. Rolling historical range
8. Product default

Explicit user input must always override inferred capacity, subject only to a hard available-time ceiling.

---

## 10. Historical Data Requirements

Historical personalisation must require a minimum sample size.

Suggested minimums:

```text
Weekday-specific estimate: 4 valid matching weekdays
Rolling estimate: 7 valid active days
High-confidence estimate: 14+ valid active days
```

If the sample size is insufficient:

```text
weekday → rolling → default
```

Do not fabricate confidence from sparse data.

---

## 11. Valid Historical Day

A day may count as valid when:

- At least one legitimate TaskLaunch work session occurred, or
- The user explicitly entered daily availability
- The data is not corrupted
- The day is not excluded
- Historical analysis is enabled

A day with no recorded activity must not automatically count as zero capacity.

This avoids treating holidays, forgotten tracking, days away, or intentionally inactive days as evidence of low capacity.

---

## 12. Statistical Method

Use robust deterministic statistics.

Preferred baseline:

```text
lowerBound = 25th percentile
midpoint = median
upperBound = 75th percentile
```

Prefer:

- Median
- Percentiles
- Capped outliers

Avoid using arithmetic mean as the sole measure.

Suggested outlier policy:

```text
Cap individual daily completion values at the 95th percentile of the active history window before calculating personalised capacity.
```

Exact implementation should be validated against real TaskLaunch history data.

---

## 13. Default Capacity

If insufficient history exists, use a configurable conservative default.

Suggested initial fallback:

```text
30–60 minutes
```

If onboarding already contains explicit productivity preferences that can safely provide a better baseline, reuse them.

Suggested message:

```text
This estimate will become more personalised as TaskLaunch learns from your completed sessions.
```

---

## 14. Full-Day vs Remaining Capacity

Keep these values separate.

### Full-Day Capacity

Estimated total realistic task work for the entire day.

### Remaining Capacity

```text
remaining = fullDayCapacity - completedMinutesToday
```

Clamp minimum values at zero.

Example:

```text
Full-day estimate: 60–80 minutes
Completed: 55 minutes
Remaining: 5–25 minutes
```

Daily Executive Brief should consume remaining capacity when evaluating the rest of the day.

---

## 15. Manual Override

The user may override today's capacity.

MVP scope:

```text
Today only
```

Controls:

```text
[Reduced] [Light] [Standard] [Strong] [Custom]
```

Manual override must:

- Apply immediately
- Be visible
- Be reversible
- Recalculate remaining capacity
- Refresh Daily Executive Brief
- Refresh Next Best Action duration-fit context
- Not modify historical completion data
- Not permanently alter baseline statistics

---

## 16. Capacity Calculation Pipeline

Suggested deterministic pipeline:

```text
baselineRange =
    weekdayHistoricalRange
    OR rollingHistoricalRange
    OR defaultRange

if manualCustomMinutes:
    fullDayRange = manualCustomRange
else if manualState:
    fullDayRange = mapStateToBaseline(manualState, baselineRange)
else:
    fullDayRange = baselineRange

availableCeiling =
    explicitAvailableMinutes
    OR focusWindowRemaining
    OR scheduleAvailableMinutes
    OR none

fullDayRange = applyAvailableCeiling(fullDayRange, availableCeiling)
remainingRange = subtractCompletedMinutes(fullDayRange, completedMinutesToday)
confidence = calculateConfidence(historySampleSize, signalQuality, variance, availableTimeKnown)
```

---

## 17. Confidence Model

Supported values:

```text
LOW
MEDIUM
HIGH
```

Suggested deterministic rules:

### High

- 14+ valid historical days
- 4+ matching weekdays
- Reliable session data
- Low or moderate variance
- Available time known

### Medium

- 7+ valid historical days
- Some matching weekday evidence
- Moderate variance

### Low

- Sparse history
- Default fallback
- Unknown available time
- High variance

Manual override should be considered authoritative for today's planning but must not falsely increase confidence in historical modelling.

---

## 18. Explainability

The UI should show the strongest signals used.

Example:

```text
Based on:
• your recent Friday completion range
• your remaining focus window
• 20 minutes already completed today
```

Stable reason codes:

```text
USER_OVERRIDE
CUSTOM_MINUTES
FOCUS_WINDOW_REMAINING
SCHEDULE_AVAILABILITY
WEEKDAY_HISTORY
ROLLING_HISTORY
TODAY_COMPLETED_WORK
DEFAULT_BASELINE
AVAILABLE_TIME_CAP
INSUFFICIENT_HISTORY
HIGH_VARIANCE
```

---

## 19. AI Role

No AI is required for the core feature.

Optional AI may later rephrase deterministic reason codes into shorter natural language.

AI must not calculate capacity, change the range, infer fatigue or mood, infer burnout or medical state, introduce unsupported causes, or override manual input.

---

## 20. Data Model

Suggested path:

```text
users/{userId}/dailyCapacity/{yyyy-mm-dd}
```

Suggested TypeScript model:

```ts
export type CapacityState =
  | "REDUCED"
  | "LIGHT"
  | "STANDARD"
  | "STRONG"
  | "USER_DEFINED"
  | "INSUFFICIENT_DATA";

export type CapacityConfidence = "LOW" | "MEDIUM" | "HIGH";

export type CapacityPrimarySource =
  | "USER_CUSTOM"
  | "USER_STATE"
  | "WEEKDAY_HISTORY"
  | "ROLLING_HISTORY"
  | "DEFAULT";

export interface DailyCapacitySnapshot {
  id: string;
  userId: string;
  localDate: string;
  fullDayRange: { min: number; max: number };
  remainingRange: { min: number; max: number };
  completedMinutesToday: number;
  availableMinutesCeiling?: number | null;
  state: CapacityState;
  confidence: CapacityConfidence;
  primarySource: CapacityPrimarySource;
  sourceSignals: string[];
  manualOverride?: {
    type: "STATE" | "MINUTES";
    state?: CapacityState;
    minutes?: number;
    createdAt: string;
  } | null;
  historicalSampleSize: number;
  generatedAt: string;
  expiresAt: string;
  sourceVersion: string;
}
```

---

## 21. Historical Capacity Aggregate

Prefer aggregated history rather than rescanning raw session history on every request.

Suggested path:

```text
users/{userId}/behaviourFeatures/capacity
```

Potential fields:

```ts
export interface CapacityHistoryFeatures {
  rolling7DayMedianMinutes?: number;
  rolling28DayMedianMinutes?: number;
  rolling28DayP25Minutes?: number;
  rolling28DayP75Minutes?: number;
  weekdayStats: {
    [weekday: string]: {
      sampleSize: number;
      medianMinutes: number;
      p25Minutes: number;
      p75Minutes: number;
    };
  };
  validDayCount: number;
  varianceBand: "LOW" | "MEDIUM" | "HIGH";
  calculatedAt: string;
  sourceVersion: string;
}
```

---

## 22. API Contracts

### Get Today's Capacity

```http
GET /api/executive-function/capacity/today
```

### Refresh Capacity

```http
POST /api/executive-function/capacity/today/refresh
```

### Set Manual Override

```http
POST /api/executive-function/capacity/today/override
```

State request:

```json
{ "type": "STATE", "state": "LIGHT" }
```

Custom minutes request:

```json
{ "type": "MINUTES", "minutes": 45 }
```

### Clear Override

```http
DELETE /api/executive-function/capacity/today/override
```

---

## 23. Freshness and Invalidation

Capacity should refresh when:

- Local date changes
- Manual override changes
- Available-time override changes
- Focus-window availability changes materially
- A task session completes
- Completed minutes change materially
- Capacity history aggregate changes
- User manually refreshes

Suggested freshness window:

```text
15 minutes
```

Do not recalculate on every timer tick.

---

## 24. Daily Executive Brief Integration

After Adaptive Daily Capacity is implemented, Daily Executive Brief must consume:

```text
remainingRange.min
remainingRange.max
state
confidence
primarySource
sourceSignals
```

Daily Executive Brief must stop maintaining a parallel capacity algorithm.

Adaptive Daily Capacity becomes the authoritative source.

Backward-compatible migration requirements:

- Existing brief behaviour must continue if the capacity service is unavailable
- Introduce the service behind an interface
- Add fallback to current Daily Executive Brief capacity logic during rollout
- Remove duplicate capacity logic only after parity tests pass

---

## 25. Next Best Action Integration

Next Best Action may consume:

- Remaining capacity range
- Capacity state
- Explicit available minutes

For MVP:

- Capacity is a soft duration-fit input
- Urgent work must not be excluded solely because remaining capacity is low
- Hard deadlines remain authoritative
- Capacity must not change explicit priority
- Ranking remains deterministic

Potential reason code:

```text
FITS_REMAINING_CAPACITY
```

---

## 26. Dashboard UI

Recommended compact component:

```text
TODAY'S CAPACITY

55–75 min remaining
Standard

Based on your recent Friday pattern and remaining focus window.

[Adjust]
```

Adjustment modal:

```text
How much can you realistically take on today?

[Reduced]
[Light]
[Standard]
[Strong]

or

Custom time:
[ 45 ] minutes

[Use estimate] [Apply]
```

Supporting copy:

```text
This only changes today's planning. It won't affect your history.
```

---

## 27. Ownership and Security

Requirements:

- Capacity snapshots are user-scoped
- Historical aggregates are user-scoped
- Server loads history directly
- Client must not submit trusted aggregate data
- Another user cannot read or modify capacity
- Manual overrides require authenticated ownership
- Raw task titles and notes are not needed
- Capacity calculations should use aggregate values where possible

---

## 28. Privacy

Prefer:

```text
aggregate minutes
dates
weekday
session counts
focus-window configuration
manual capacity input
```

Avoid requiring:

```text
task titles
task notes
Brain Dump source
clarification text
friend data
leaderboard data
notification content
```

---

## 29. Analytics Events

Do not include task content or raw behavioural history.

Track:

```text
daily_capacity_generated
daily_capacity_viewed
daily_capacity_refreshed
daily_capacity_override_opened
daily_capacity_override_set
daily_capacity_override_cleared
daily_capacity_source_changed
daily_capacity_insufficient_history
daily_capacity_generation_failed
```

Safe properties:

- Capacity state
- Confidence
- Primary source
- Source-signal codes
- Historical sample-size bucket
- Remaining-capacity bucket
- Override type
- Latency

---

## 30. Success Metrics

Primary metric:

> Reduction in absolute error between estimated daily capacity and actual completed focused minutes over time.

Supporting metrics:

- Capacity override rate
- Capacity override direction
- Plan-health accuracy improvement
- Daily Brief overload-classification improvement
- Next Best Action start rate by capacity fit
- Percentage of users graduating from default to personalised estimates
- Estimate confidence distribution
- Estimate-versus-completion error by confidence band

---

## 31. Guardrail Metrics

Monitor:

- Capacity exceeding hard available-time ceiling
- Negative remaining capacity
- Days with no tracking being treated as zero capacity
- Manual overrides altering historical statistics
- Cross-user aggregate exposure
- Capacity state being described as medical or emotional state
- Historical aggregate corruption
- Excessive recalculation
- Capacity inference from unsupported data
- Next Best Action suppressing urgent tasks because of low capacity

Any cross-user exposure or health-state inference is a critical defect.

---

## 32. Failure Handling

### Capacity Service Failure

Daily Executive Brief and Next Best Action must continue with their existing fallback behaviour.

Suggested UI:

```text
Using your standard planning range today.
```

### Historical Aggregate Missing

Fallback:

```text
weekday history → rolling history → product default
```

### Corrupt Aggregate

Ignore corrupt aggregate and rebuild asynchronously or on demand.

### Manual Override Failure

Do not alter current estimate until the override is successfully persisted.

---

## 33. Performance Targets

| Operation | Target |
|---|---:|
| Cached capacity read | Under 200 ms |
| Capacity calculation | Under 300 ms |
| Manual override | Under 500 ms |
| Historical aggregate read | Under 200 ms |
| Aggregate incremental update | Under 500 ms |
| Full aggregate rebuild | Background / non-blocking |

No AI call should be required for core capacity generation.

---

## 34. Accessibility Requirements

The interface must support:

- Keyboard navigation
- Screen readers
- Visible focus states
- Large touch targets
- Accessible capacity selector
- Text labels in addition to state indicators
- No colour-only communication
- Reduced motion
- Clear override state
- Accessible custom-minute input
- Clear reset-to-estimate action

---

## 35. MVP Scope

### Included

- Deterministic capacity service
- Full-day capacity range
- Remaining capacity range
- User-selected capacity states
- Custom minutes override
- Weekday historical baseline
- Rolling historical baseline
- Default fallback
- Percentile-based ranges
- Minimum history requirements
- Confidence
- Explainable source signals
- Historical aggregate
- Daily Executive Brief integration
- Next Best Action integration
- Dashboard capacity component
- Refresh and invalidation
- Analytics
- Unit, integration, and end-to-end tests

### Excluded

- Calendar integration
- Sleep/wearable integration
- Health data
- Mood input
- Passive device monitoring
- Automatic task movement
- Automatic task reduction
- Schedule Repair
- Recovery Mode
- Long-term ML personalisation

---

## 36. Phase Two Scope

Phase Two may introduce:

- Explicit morning capacity check-in
- Calendar availability
- Distinct work/home capacity profiles
- Task-energy matching
- Concentration-level matching
- Better variance modelling
- Holiday and leave handling
- Scheduled low-capacity days
- Capacity forecasting
- Weekly capacity trends

---

## 37. Ordered Build Plan

### Phase 1: Capacity Contract and History Aggregate

1. Inspect existing session/history data
2. Define valid historical day
3. Define capacity enums
4. Define source-signal enums
5. Define aggregate schema
6. Implement percentile/median helpers
7. Implement weekday aggregation
8. Implement rolling aggregation
9. Add outlier handling
10. Add unit tests

Completion condition:

```text
Historical session data can be deterministically converted into a stable capacity aggregate without using task content.
```

### Phase 2: Capacity Calculation Service

1. Implement source precedence
2. Implement default fallback
3. Implement full-day range calculation
4. Implement hard available-time ceiling
5. Implement completed-work subtraction
6. Implement remaining range
7. Implement confidence
8. Implement reason codes
9. Add snapshot persistence
10. Add deterministic tests

### Phase 3: Manual Override

1. Add state override
2. Add custom-minute override
3. Add clear override
4. Apply hard ceiling
5. Ensure history is unchanged
6. Add immediate invalidation
7. Add API tests
8. Add ownership tests

### Phase 4: Executive Function Integration

1. Add capacity service interface
2. Integrate Daily Executive Brief
3. Preserve old brief fallback
4. Add parity tests
5. Integrate Next Best Action
6. Add duration-fit reason
7. Preserve hard deadline behaviour
8. Add integration tests

### Phase 5: Dashboard and Hardening

1. Add capacity component
2. Add adjust modal
3. Add explanation UI
4. Add confidence display
5. Add loading/failure states
6. Add analytics
7. Add redaction tests
8. Add accessibility tests
9. Add E2E tests
10. Add deterministic fixture suite

---

## 38. Testing Requirements

### Unit Tests

Cover:

- Median
- Percentiles
- Outlier handling
- Valid-day classification
- Weekday aggregation
- Rolling aggregation
- Source precedence
- Hard available-time ceiling
- Completed-work subtraction
- Manual state mapping
- Custom override
- Confidence
- Reason codes

### Integration Tests

Cover:

- User-scoped aggregate reads
- Snapshot generation
- Manual override persistence
- Override clearing
- Historical aggregate update
- Daily Brief consumption
- Next Best Action consumption
- Fallback when capacity service fails
- Analytics redaction

### End-to-End Tests

1. New user receives default range
2. User with sufficient history receives personalised range
3. Friday estimate uses Friday history
4. Custom 45-minute override applies immediately
5. Override does not alter history
6. Completed work reduces remaining capacity
7. Hard available-time ceiling caps estimate
8. Daily Brief uses adaptive range
9. Next Best Action respects remaining capacity as a soft signal
10. Service failure preserves existing app behaviour

---

## 39. Deterministic Evaluation Fixtures

Create at least 100 capacity scenarios.

Include:

- No history
- Sparse history
- Strong weekday history
- High-variance history
- Outlier workdays
- Zero tracked days
- Holidays/inactive days
- Short focus window
- Long focus window
- Completed work near capacity
- Completed work exceeding estimate
- Manual reduced state
- Manual strong state
- Custom minutes
- Hard available-time ceiling

Validate:

- Correct source selection
- Stable capacity range
- Correct confidence
- Correct reason codes
- No negative range
- No ceiling violation
- No zero-capacity inference from missing activity

---

## 40. Recommended Product Copy

### Heading

```text
Today's capacity
```

### Standard State

```text
Your current workload range looks typical for you.
```

### Light State

```text
A lighter workload looks more realistic today.
```

### Strong State

```text
You have room for a little more focused work today.
```

### Insufficient History

```text
TaskLaunch will personalise this estimate as more session history becomes available.
```

### Adjust

```text
Adjust today
```

### Override Support

```text
This changes today's planning only.
```

---

## 41. Codex Implementation Rules

1. Inspect current session history, focus-window, Daily Executive Brief, and Next Best Action implementations before coding.
2. Reuse existing history and session data.
3. Do not use task titles or notes unless technically unavoidable.
4. Keep all capacity calculations deterministic.
5. Do not call an AI provider for core capacity calculation.
6. Prefer aggregate history over repeated raw-history scans.
7. Keep statistical thresholds configurable.
8. Never treat missing activity as zero capacity by default.
9. Manual overrides must not alter history.
10. Hard available-time ceilings must always win.
11. Daily Executive Brief must eventually consume this service rather than maintain parallel capacity logic.
12. Preserve current Daily Executive Brief fallback until parity is proven.
13. Next Best Action must treat capacity as a soft signal only.
14. Do not add health, mood, fatigue, or burnout inference.
15. Add one observable failing test before each behaviour.
16. Mock only external boundaries such as Firebase, time, and network.
17. Do not implement Schedule Repair in this feature.
18. Document deviations from this PRD.

---

## 42. Definition of Done

The MVP is complete when:

- Historical TaskLaunch activity can produce a stable aggregate
- Full-day capacity can be estimated
- Remaining capacity accounts for completed work
- Weekday-specific history is used when sufficient
- Rolling history is used as fallback
- Default range is used when history is insufficient
- Hard available-time ceilings are respected
- Manual state and minute overrides work
- Overrides do not alter historical data
- Confidence and source signals are available
- Daily Executive Brief consumes Adaptive Daily Capacity
- Next Best Action consumes remaining capacity as a soft signal
- Current fallback behaviour survives capacity-service failure
- Cross-user access is prevented
- Analytics exclude task content
- Unit, integration, and E2E tests pass

---

## 43. Recommended First Codex Task

```text
Build the TaskLaunch Adaptive Daily Capacity history foundation.

Requirements:
- Inspect existing session/history, focus-window, Daily Executive Brief, and Next Best Action code.
- Define the valid historical-day contract.
- Define capacity state, confidence, primary-source, and reason-code enums.
- Implement a user-scoped historical capacity aggregate using completed session minutes.
- Add weekday-specific and rolling statistics using median and percentile ranges.
- Add minimum sample-size rules.
- Add configurable outlier handling.
- Do not implement the Dashboard UI yet.
- Do not integrate Daily Executive Brief or Next Best Action yet.
- Do not use AI.
- Do not treat no-activity days as zero capacity by default.
- Add unit tests for aggregation, percentiles, sample-size fallback, outliers, and valid-day handling.
- Follow incremental TDD.
```
