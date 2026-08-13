# TaskLaunch Executive Function Engine

## Product Requirements Document

**Document status:** Draft  
**Product:** TaskLaunch  
**Feature:** Executive Function Engine  
**Target platforms:** Web and Android  
**Primary stack:** Next.js, React, Firebase Authentication, Firestore, Cloud Functions, Firebase Cloud Messaging  
**Target audience:** People who experience executive dysfunction, including users with ADHD, autism, fluctuating energy, inconsistent focus, or difficulty initiating and organising tasks

---

## 1. Product Summary

The TaskLaunch Executive Function Engine is an AI-powered decision layer that continuously interprets a user’s tasks, activity patterns, capacity, priorities, deadlines, and historical behaviour.

Its purpose is to reduce the executive effort required to decide:

- What to do next
- When to do it
- How much work is realistic
- How to begin a difficult task
- When to reschedule or reduce expectations
- How to recover after plans are disrupted

Unlike a conventional AI chatbot, the Executive Function Engine should operate primarily through contextual recommendations, adaptive task planning, and explainable automations embedded throughout the TaskLaunch interface.

The engine must assist without taking control away from the user. Significant changes should remain visible, reversible, and governed by user-selected autonomy settings.

---

## 2. Problem Statement

Traditional productivity applications require users to perform the same cognitive work they are intended to simplify.

Users must typically:

- Estimate task duration
- Prioritise competing responsibilities
- Break down complex work
- Select suitable times
- Recognise when a plan has become unrealistic
- Reorganise tasks after interruptions
- Decide whether they are procrastinating, overloaded, or fatigued
- Rebuild momentum after missing planned work

These activities depend heavily on executive functioning.

For users with executive dysfunction, the process of managing the productivity system can become another demanding task. Static schedules, rigid streaks, generic reminders, and large task lists can increase avoidance, shame, and decision paralysis.

TaskLaunch already records signals such as task duration, scheduling, completion history, momentum, focus windows, and user interaction. The Executive Function Engine will convert these signals into practical assistance.

---

## 3. Product Vision

TaskLaunch should behave like an adaptive executive-function support system that quietly reduces friction throughout the day.

The desired user experience is:

> TaskLaunch understands what I intended to do, recognises what I am realistically capable of today, and helps me make progress without making me reorganise everything myself.

The engine should progress through three levels of capability:

1. **Understand**  
   Interpret tasks, deadlines, behaviour, capacity, and historical patterns.

2. **Recommend**  
   Suggest the most appropriate next action, task breakdown, schedule adjustment, or workload change.

3. **Act with permission**  
   Automatically make approved low-risk changes based on user-defined autonomy settings.

---

## 4. Goals

### 4.1 Primary Goals

The Executive Function Engine must:

- Reduce the number of decisions required to begin productive work
- Help users start tasks they are avoiding
- Create realistic daily task plans
- Adapt workload to changing capacity
- Reduce manual rescheduling
- Detect planning and initiation friction
- Turn vague tasks into actionable steps
- Protect the user from unrealistic overcommitment
- Improve task completion without increasing pressure
- Support recovery after disrupted or low-capacity days

### 4.2 Secondary Goals

The engine should:

- Improve the accuracy of TaskLaunch task-duration estimates
- Increase the value of historical session data
- Create a distinctive paid feature for TaskLaunch
- Improve user retention through personalised assistance
- Provide useful intelligence without requiring users to learn prompt engineering
- Generate structured behavioural insights that can support future TaskLaunch features

### 4.3 Non-Goals

The initial version will not:

- Diagnose ADHD, autism, depression, burnout, or any medical condition
- Infer emotional or health states with certainty
- Replace professional health, psychological, or occupational support
- Read private data from unrelated applications without explicit authorisation
- Automatically delete tasks
- Automatically alter critical deadlines
- Send messages or make external commitments on the user’s behalf
- Fully control the user’s calendar
- Punish users for rejecting recommendations
- Use manipulative engagement mechanisms

---

## 5. Product Principles

### 5.1 Assistance Without Control

The engine should reduce cognitive burden while preserving user agency.

### 5.2 Explainable Recommendations

Every recommendation must include a concise explanation of why it was made.

Example:

> Suggested for now because it takes approximately 12 minutes, has been postponed twice, and matches your current focus window.

### 5.3 Reversible Actions

AI-generated changes must be undoable wherever technically practical.

### 5.4 Confidence-Aware Behaviour

The engine must distinguish between:

- Confirmed facts
- Behavioural patterns
- Predictions
- Low-confidence assumptions

Low-confidence predictions must not trigger high-impact automatic actions.

### 5.5 No Shame-Based Design

The system must avoid language such as:

- You failed
- You are behind
- You broke your streak
- You should have completed this
- You were unproductive

Preferred language should focus on capacity, adjustment, recovery, and the next available action.

### 5.6 Progressive Personalisation

The engine should begin conservatively and improve as reliable user-specific data becomes available.

### 5.7 Minimal-Input Operation

Users should receive value without needing to hold extended conversations with an AI assistant.

---

## 6. Target Users

### 6.1 Primary User

A user who:

- Has multiple tasks but struggles to decide where to begin
- Frequently postpones or reschedules tasks
- Underestimates or overestimates task duration
- Experiences inconsistent focus or energy
- Becomes overwhelmed by long task lists
- Benefits from external structure
- Wants support without rigid enforcement

### 6.2 Secondary User

A generally productive user who wants TaskLaunch to:

- Optimise their daily workload
- Reduce scheduling effort
- Automatically break down projects
- Identify behavioural patterns
- Improve planning accuracy

---

## 7. Core User Needs

Users need the engine to answer five practical questions:

1. What should I do now?
2. How do I start this task?
3. Is today’s plan realistic?
4. What should change when the day goes off track?
5. How can I recover without rebuilding everything manually?

---

## 8. Core Feature Set

### 8.1 Daily Executive Brief

The Daily Executive Brief provides a concise, adaptive overview of the user’s day.

It should include:

- Recommended priority task
- Suggested first action
- Estimated realistic workload
- Current focus or capacity classification
- Relevant deadlines
- Tasks the engine recommends moving, reducing, or splitting
- One optional observation based on historical behaviour

Example:

> You have approximately 75 minutes of planned work today. Based on your recent Tuesdays, 45–60 minutes is likely to be more realistic. Start with “Review onboarding copy,” which should take around 12 minutes.

#### Requirements

- Generated when the user first opens TaskLaunch each day
- Refreshable manually
- Updated when major scheduling conditions change
- Limited to essential information
- Every recommended change must be individually reviewable
- Users may apply all suggested low-risk changes together

### 8.2 Next Best Action

The engine recommends a single task or task step suited to the user’s current context.

The recommendation should consider:

- Priority
- Deadline
- Estimated duration
- Current available time
- User focus window
- Historical completion patterns
- Task postponement history
- Task dependencies
- Required energy or concentration
- Recent context switching
- User-selected work mode
- Location or device context when explicitly available

#### Output

The engine should provide:

- Recommended task
- Suggested first step
- Estimated effort
- Reason for recommendation
- Alternative task
- Start button

Example:

> **Recommended now:** Confirm the final subscription feature list  
> **First step:** Review the four Plus-only features  
> **Estimated effort:** 8–12 minutes  
> **Why this task:** It is blocking the pricing page and fits the time available before your next scheduled break.

### 8.3 Intelligent Brain Dump

Users can enter or dictate unstructured thoughts. The engine converts them into structured TaskLaunch items.

#### Supported Extraction

- Task titles
- Due dates
- Approximate durations
- Priorities
- Dependencies
- Projects
- Recurrence
- Location requirements
- Energy or concentration requirements
- Optional subtasks
- Ambiguous items requiring clarification

#### Example Input

> I need to finish the Play Store screenshots, call the dentist before Thursday, check whether the privacy policy needs updating, and maybe mow the lawn this weekend if it is not raining.

#### Expected Result

The engine creates a review screen containing:

- Finish Play Store screenshots
- Call dentist — due before Thursday
- Review privacy policy requirements
- Mow lawn — weekend, weather-dependent

No task should be committed until the user confirms the extracted items.

### 8.4 Task Clarification and Decomposition

The engine detects tasks that are too broad, vague, or difficult to initiate.

Examples:

- Work on app
- Sort out tax
- Research marketing
- Fix onboarding
- Clean house

The engine should propose:

- A clearer task title
- A measurable completion condition
- A small first action
- Optional subtasks
- Estimated durations
- A suggested stopping point

Example:

**Original task:** Update onboarding

**Suggested breakdown:**

1. Review current onboarding screens — 10 minutes
2. List unclear or repetitive copy — 10 minutes
3. Rewrite the first three screens — 20 minutes
4. Test the revised flow — 15 minutes

The user may:

- Accept all steps
- Select individual steps
- Edit the breakdown
- Ask for smaller steps
- Keep the original task unchanged

### 8.5 Friction Detection

The engine identifies behavioural signals that may indicate difficulty starting or progressing.

Potential signals include:

- Opening and closing the same task repeatedly
- Repeatedly rescheduling a task
- Editing a task without starting it
- Starting multiple short sessions across different tasks
- Excessive task reordering
- Long delay between opening a task and starting its timer
- Repeatedly abandoning sessions shortly after starting
- Maintaining a task beyond its due date without progress
- Frequently using vague task language
- Planning more work than is historically completed

#### Response Options

When friction is detected, the engine may offer:

- Break this into smaller steps
- Start a two-minute launch session
- Replace it with an easier task
- Reschedule it without penalty
- Reduce the completion target
- Open Focus Mode
- Add a definition of done
- Identify the blocker
- Remove it from today’s view

The engine must not describe friction as laziness, failure, or lack of discipline.

### 8.6 Adaptive Daily Capacity

The engine estimates a practical workload range for the current day.

The estimate may consider:

- Historical work completed on the same weekday
- Recent session duration
- Current momentum
- Recent missed or postponed tasks
- Time remaining in the day
- User-selected capacity
- Calendar availability where integrated
- Current focus window
- User feedback on recent recommendations

#### Capacity States

The interface may use neutral capacity states such as:

- Reduced
- Light
- Standard
- Strong

Users must be able to override the estimated state.

The system must not claim to know the user’s emotional, medical, or physiological condition.

Preferred wording:

> Your recent activity suggests that a lighter plan may be more realistic today.

Avoid:

> You are burned out today.

### 8.7 Automatic Schedule Repair

When a plan becomes unrealistic, the engine proposes a revised schedule.

Triggers may include:

- A task running longer than expected
- A missed focus window
- Multiple skipped tasks
- A newly added urgent task
- Reduced available time
- A deadline change
- A user manually selecting reduced capacity

The repair engine should:

- Preserve critical deadlines
- Protect high-priority tasks
- Move flexible work
- Reduce nonessential daily goals
- Avoid stacking excessive work onto the next day
- Respect unavailable days and preferred focus windows
- Explain all proposed changes
- Allow individual changes to be accepted or rejected

Example:

> Today’s remaining plan contains 110 minutes of work, but only 55 minutes remain in your selected productivity window. I suggest moving two flexible tasks to Thursday and reducing one session target from 30 to 15 minutes.

### 8.8 Personal Task Language Learning

The engine identifies wording patterns associated with task avoidance or ambiguity.

Example patterns:

- Look into
- Think about
- Sort out
- Work on
- Research
- Handle
- Figure out

The engine may suggest converting these into time-bounded or outcome-based tasks.

Example:

> “Research push notifications” is broad. Change it to “Compare three Firebase notification scheduling approaches for 20 minutes”?

These transformations should initially be suggestions. Automatic rewriting may be enabled later through user settings.

### 8.9 Behavioural Pattern Insights

The engine generates useful, nonjudgmental observations from historical data.

Examples:

- Tasks estimated at 15 minutes usually take closer to 25 minutes
- Administrative tasks are more likely to be completed before midday
- Tasks postponed more than three times have a low completion rate without being divided
- Sessions started during the user’s selected focus window are longer on average
- Mondays consistently contain more planned work than completed work
- Tasks with a defined first step are started sooner

Insights must:

- Be based on sufficient data
- Display the relevant observation period
- Avoid causal claims unless directly supported
- Allow the user to dismiss or hide them
- Avoid medical or psychological interpretation

### 8.10 Conversational Planning

Users may instruct the engine through natural language.

Examples:

- Work is unusually busy until Friday
- Keep tomorrow light
- I only have 20 minutes
- Do not schedule household tasks this week
- Move anything optional out of today
- Help me begin the tax task
- I want one meaningful win today
- Stop recommending calls in the morning

The engine converts the instruction into proposed TaskLaunch changes.

Before applying changes, it should show:

- What it understood
- Which tasks or settings will change
- How long the change applies
- An edit or cancel option

### 8.11 Recovery Mode

Recovery Mode helps users resume after an interrupted period without confronting an accumulated backlog.

It may activate when:

- The user has not opened TaskLaunch for several days
- A large number of overdue tasks have accumulated
- Multiple scheduled days were missed
- The user manually activates it

Recovery Mode should:

- Hide nonessential backlog by default
- Identify genuinely urgent tasks
- Suggest one easy restart task
- Present rescheduling options in bulk
- Avoid displaying punitive streak-loss messaging
- Allow old tasks to be reviewed gradually
- Create a realistic restart plan

Example:

> You have 18 tasks carried over from the past week. Two appear time-sensitive. The rest can be reviewed later. Start with one 10-minute task and rebuild from there.

### 8.12 Autonomy Controls

Users must choose how much authority the engine has.

#### Level 1: Advisory

The engine only provides recommendations.

It cannot change tasks, schedules, durations, or settings.

#### Level 2: Assisted

The engine may prepare proposed changes, but the user must approve them.

#### Level 3: Trusted Automation

The engine may automatically perform approved low-risk actions.

Examples:

- Move flexible tasks within the same week
- Reduce optional daily session targets
- Rewrite vague task titles
- Break a task into draft subtasks
- Hide low-priority tasks from today’s view

High-impact actions must still require confirmation.

Examples:

- Changing a deadline
- Deleting a task
- Moving a critical task beyond its due date
- Modifying recurring task rules
- Communicating externally
- Changing billing or account settings

---

## 9. User Experience

### 9.1 Primary Interface Locations

The Executive Function Engine should be distributed across TaskLaunch rather than confined to a chatbot screen.

Primary locations:

- Dashboard executive brief
- Next Best Action card
- Task card recommendations
- Task creation flow
- Focus Mode
- Daily planning screen
- History and Insights
- Notification actions
- Recovery Mode
- Optional AI command interface

### 9.2 Dashboard Components

Recommended dashboard components:

#### Executive Brief

A short summary of the day and recommended adjustments.

#### Next Best Action

One task with a direct start action.

#### Capacity Indicator

A user-adjustable estimate of realistic workload.

#### Plan Health

A status indicating whether the current schedule is:

- Realistic
- Slightly overloaded
- Significantly overloaded
- Missing required information

#### Suggested Adjustments

A collapsible list of proposed changes.

### 9.3 Recommendation Card Design

Each recommendation should display:

- Recommendation title
- Proposed action
- Reason
- Confidence where useful
- Expected benefit
- Accept
- Edit
- Dismiss
- Do not suggest this again

Example:

> **Split this task**
>
> “Prepare app launch” has been postponed five times and does not have a defined completion point.
>
> Suggested first step: Confirm the Play Store release checklist.
>
> [Review breakdown] [Not now]

### 9.4 Feedback Controls

Users should be able to provide lightweight feedback:

- Helpful
- Not helpful
- Wrong timing
- Wrong task
- Too much intervention
- Too little explanation
- Do not use this signal
- Do not suggest this again

Feedback should influence future ranking and recommendation behaviour.

---

## 10. Functional Requirements

### 10.1 Task Intelligence

The engine must be capable of generating or predicting:

- Task category
- Estimated duration range
- Priority recommendation
- Required energy level
- Concentration level
- Task ambiguity score
- Initiation difficulty score
- Flexibility
- Suggested deadline
- Suggested first action
- Suggested subtasks
- Dependencies
- Likely completion window

All AI-generated fields must be distinguishable from user-entered fields.

### 10.2 Recommendation Engine

The engine must rank candidate actions using a combination of:

- Explicit user priority
- Deadline proximity
- Task impact
- Task dependencies
- Time available
- Focus-window alignment
- Estimated duration
- Historical completion likelihood
- Postponement count
- Recent task-switching behaviour
- User capacity
- Recommendation feedback
- User autonomy settings

The ranking system should combine deterministic business rules with AI-generated interpretations.

Critical scheduling constraints should not be delegated entirely to a language model.

### 10.3 Confidence Model

Every AI output that may modify user data must include an internal confidence value.

Suggested confidence bands:

| Confidence | Range |
|---|---:|
| High | 0.80–1.00 |
| Moderate | 0.60–0.79 |
| Low | Below 0.60 |

Low-confidence outputs should:

- Ask for confirmation
- Avoid automatic changes
- Present alternatives
- Clearly state uncertainty where relevant

### 10.4 Explainability

Each recommendation must store structured reason codes.

Example reason codes:

- `DEADLINE_APPROACHING`
- `FITS_AVAILABLE_TIME`
- `MATCHES_FOCUS_WINDOW`
- `FREQUENTLY_POSTPONED`
- `BLOCKS_OTHER_TASKS`
- `LOW_ESTIMATED_EFFORT`
- `OVERLOADED_DAY`
- `HISTORICALLY_SUCCESSFUL_TIME`
- `USER_REQUESTED_LIGHT_DAY`
- `TASK_TOO_BROAD`
- `TASK_DURATION_UNCERTAIN`

The user-facing explanation may be generated from these structured reasons.

### 10.5 Undo History

The engine must maintain an audit trail of AI-assisted changes.

Each record should include:

- Original value
- Updated value
- Action type
- Timestamp
- Initiating recommendation
- Whether the user approved the change
- Model or engine version
- Undo status

Users should be able to undo recent schedule and task modifications.

---

## 11. Proposed Data Model

### 11.1 User AI Preferences

Path:

```text
users/{userId}/aiPreferences
```

Suggested fields:

```json
{
  "enabled": true,
  "autonomyLevel": "advisory",
  "dailyBriefEnabled": true,
  "nextBestActionEnabled": true,
  "frictionDetectionEnabled": false,
  "adaptiveCapacityEnabled": false,
  "automaticScheduleRepairEnabled": false,
  "taskDecompositionEnabled": true,
  "behaviouralInsightsEnabled": false,
  "notificationRecommendationsEnabled": true,
  "explanationDetail": "standard",
  "sensitiveInferenceDisabled": true,
  "dataRetentionPreference": "standard",
  "modelImprovementConsent": false,
  "lastUpdatedAt": "timestamp"
}
```

### 11.2 Task Intelligence

Path:

```text
tasks/{taskId}/intelligence/current
```

Suggested fields:

```json
{
  "estimatedDurationMinutes": 20,
  "estimatedDurationRange": {
    "min": 15,
    "max": 30
  },
  "durationConfidence": 0.82,
  "ambiguityScore": 0.25,
  "initiationDifficultyScore": 0.65,
  "energyRequirement": "medium",
  "concentrationRequirement": "high",
  "flexibility": "medium",
  "suggestedFirstAction": "Open the current onboarding flow",
  "suggestedSubtasks": [],
  "dependencies": [],
  "reasonCodes": [],
  "generatedAt": "timestamp",
  "engineVersion": "1.0",
  "source": "ai"
}
```

### 11.3 Recommendations

Path:

```text
users/{userId}/recommendations/{recommendationId}
```

Suggested fields:

```json
{
  "type": "TASK_DECOMPOSITION",
  "status": "active",
  "priority": 70,
  "confidence": 0.87,
  "taskIds": ["task_123"],
  "title": "Split this task",
  "explanation": "This task is broad and has been postponed several times.",
  "reasonCodes": [
    "TASK_TOO_BROAD",
    "FREQUENTLY_POSTPONED"
  ],
  "proposedChanges": [],
  "createdAt": "timestamp",
  "expiresAt": "timestamp",
  "acceptedAt": null,
  "dismissedAt": null,
  "feedback": null,
  "engineVersion": "1.0"
}
```

Recommendation statuses:

- Active
- Accepted
- Partially accepted
- Dismissed
- Expired
- Reversed

### 11.4 Daily Context

Path:

```text
users/{userId}/dailyContext/{date}
```

Suggested fields:

```json
{
  "capacityState": "light",
  "capacitySource": "user",
  "availableMinutes": 60,
  "plannedMinutes": 110,
  "completedMinutes": 20,
  "focusWindow": {
    "start": "09:00",
    "end": "14:00"
  },
  "planHealth": "significantly_overloaded",
  "contextSwitchCount": 4,
  "postponedTaskCount": 3,
  "brief": "A lighter plan is recommended today.",
  "generatedAt": "timestamp"
}
```

### 11.5 Behavioural Features

Path:

```text
users/{userId}/behaviourFeatures/current
```

Suggested aggregated fields:

```json
{
  "averageSessionDuration": 22,
  "durationAccuracyRatio": 1.35,
  "taskStartDelayAverage": 14,
  "completionByWeekday": {},
  "completionByTimeWindow": {},
  "postponementCompletionRate": 0.42,
  "taskSwitchFrequency": 3.2,
  "vagueTaskCompletionRate": 0.28,
  "focusWindowCompletionRate": 0.67,
  "dataWindowStart": "timestamp",
  "dataWindowEnd": "timestamp",
  "lastCalculatedAt": "timestamp"
}
```

Raw interaction events should be retained only where necessary and according to the user’s plan and privacy settings.

---

## 12. AI and System Architecture

### 12.1 Hybrid Architecture

The feature should use a hybrid system consisting of:

1. Deterministic scheduling rules
2. Behavioural feature calculations
3. Recommendation ranking
4. Large language model interpretation
5. User-feedback adaptation
6. Safety and validation layers

Language models should primarily be used for:

- Natural-language interpretation
- Task clarification
- Task decomposition
- Explanation generation
- Brain-dump extraction
- Conversational planning
- Pattern summarisation

Deterministic services should control:

- Deadline protection
- Scheduling constraints
- Task movement rules
- Autonomy permissions
- Notification limits
- Data access
- Action validation
- Undo operations

### 12.2 Proposed Processing Flow

1. User or system event occurs
2. Relevant behavioural features are updated
3. Recommendation rules identify possible interventions
4. AI produces structured output
5. Output is validated against a strict schema
6. Safety and permission checks are applied
7. Recommendation is ranked
8. Recommendation is shown or applied
9. User response is recorded
10. Future recommendation weights are updated

### 12.3 Structured AI Responses

AI services must return validated structured objects rather than unrestricted text.

Example:

```json
{
  "recommendationType": "TASK_DECOMPOSITION",
  "confidence": 0.87,
  "taskId": "task_123",
  "reasonCodes": [
    "TASK_TOO_BROAD",
    "FREQUENTLY_POSTPONED"
  ],
  "suggestedFirstAction": {
    "title": "Open the Play Console release checklist",
    "estimatedMinutes": 5
  },
  "subtasks": [
    {
      "title": "Confirm required store assets",
      "estimatedMinutes": 10
    },
    {
      "title": "Review release notes",
      "estimatedMinutes": 10
    }
  ]
}
```

All responses must pass schema validation before being displayed or applied.

### 12.4 Model Strategy

The system should support multiple model classes.

#### Lightweight Model

Used for:

- Task classification
- Short brain-dump extraction
- Recommendation explanation
- Simple title rewriting
- Intent detection

#### Advanced Reasoning Model

Used for:

- Complex task decomposition
- Multi-task schedule repair
- Dependency analysis
- Weekly planning
- Ambiguous conversational requests

#### Local or Rules-Based Processing

Used for:

- Aggregating usage statistics
- Detecting simple behavioural events
- Calculating workload
- Protecting deadlines
- Applying schedule constraints
- Selecting which AI operations are necessary

The system should avoid invoking expensive models when deterministic logic is sufficient.

---

## 13. Safety, Privacy, and Trust

### 13.1 Sensitive Inference Restrictions

The engine must not claim that the user:

- Has a medical condition
- Is depressed
- Is manic
- Is experiencing burnout
- Is emotionally unstable
- Is lazy
- Is addicted
- Has impaired judgement

It may describe observable behaviour using neutral language.

Example:

> You have shortened or skipped six planned sessions this week.

It should not state:

> Your mental health appears to be declining.

### 13.2 Data Minimisation

The engine should process only data necessary for the enabled feature.

Users should be able to disable:

- Behavioural pattern analysis
- Long-term personalisation
- Friction detection
- AI-generated insights
- Cloud AI processing where technically supported

### 13.3 User Transparency

TaskLaunch should provide an AI activity page showing:

- What categories of data are used
- What the engine has inferred
- Recent recommendations
- Recent automatic actions
- User feedback
- Current autonomy level
- Options to reset learned behaviour

### 13.4 User Data Controls

Users must be able to:

- Disable the Executive Function Engine
- Delete AI-generated profile data
- Reset personalised recommendations
- Export relevant AI preference and recommendation data
- Review recent automatic actions
- Revoke automation permissions
- Disable specific recommendation categories

---

## 14. Notification Requirements

AI notifications must be limited and context-sensitive.

Permitted examples:

- A realistic plan adjustment is available
- A task can be started with a smaller first step
- A focus window has started
- The current schedule is overloaded
- Recovery Mode is available
- A deadline may be at risk

Notifications must not:

- Repeatedly pressure the user
- Imply moral failure
- Create artificial urgency
- Continue after dismissal
- Reveal sensitive task information on a locked screen unless enabled

Notification frequency should be governed by user settings and recent engagement.

---

## 15. Subscription and Entitlement Strategy

### Free

- Limited Intelligent Brain Dump
- Basic Next Best Action
- Basic task clarification
- Limited daily recommendations
- Manual AI invocation
- Short personalisation window

### Plus

- Full Executive Brief
- Adaptive daily capacity
- Friction detection
- Automatic schedule repair
- Advanced task decomposition
- Behavioural pattern insights
- Recovery Mode
- Conversational planning
- Longer-term personalisation
- Trusted Automation controls

Early-access users with lifetime paid-feature access should receive the complete Plus feature set according to the existing TaskLaunch entitlement rules.

AI usage limits may still be required to control operating costs, but these should be expressed in practical product terms rather than technical token limits.

---

## 16. MVP Scope

The MVP should focus on high-value assistance that can be implemented without continuous background monitoring.

### Included

1. Intelligent Brain Dump
2. Task Clarification
3. Task Decomposition
4. Next Best Action
5. Daily Executive Brief
6. Manual capacity selection
7. Schedule overload detection
8. Proposed schedule repair
9. Recommendation feedback
10. AI preference controls
11. Structured recommendation storage
12. Undo for accepted task and schedule changes

### Excluded from MVP

- Fully automatic schedule changes
- Continuous real-time behavioural monitoring
- Calendar integrations
- Device activity analysis
- Voice emotion analysis
- Environmental or wearable signals
- Long-term future simulation
- Multi-agent task negotiation
- External communication
- Fully autonomous notifications

---

## 17. Phase Two Scope

Phase Two may introduce:

- Friction detection
- Adaptive capacity estimates
- Recovery Mode
- Personal task-language learning
- Behavioural pattern insights
- Improved duration prediction
- Context-aware notifications
- Calendar availability integration
- Trusted Automation for low-risk changes
- Voice-based planning
- Weekly executive review

---

## 18. Phase Three Scope

Phase Three may introduce:

- Predictive schedule-risk modelling
- Proactive workload rebalancing
- Long-term personal behaviour models
- Cross-project dependency reasoning
- Scenario planning
- Future workload simulation
- Optional wearable or health-platform signals
- Collaborative planning
- Advanced personal automation rules
- On-device inference for selected features

---

## 19. User Stories

### Daily Planning

As a user with limited focus, I want TaskLaunch to identify a realistic plan so that I do not have to manually prioritise every task.

### Task Initiation

As a user who is avoiding a broad task, I want TaskLaunch to suggest a very small first action so that I can begin without planning the entire task.

### Overloaded Schedule

As a user whose day has changed, I want TaskLaunch to reorganise the remaining work so that I do not have to repeatedly move tasks myself.

### Brain Dump

As a user with many thoughts, I want to speak or type them naturally so that TaskLaunch can convert them into usable tasks.

### Recovery

As a user returning after several missed days, I want TaskLaunch to separate urgent work from backlog so that reopening the app does not feel overwhelming.

### Autonomy

As a user who wants control, I want to define which changes TaskLaunch can make automatically so that the AI remains predictable.

### Explanation

As a user receiving a recommendation, I want to know why it was suggested so that I can decide whether to trust it.

---

## 20. Acceptance Criteria

### Intelligent Brain Dump

- The user can submit typed natural language
- The system identifies multiple tasks from one submission
- Extracted tasks appear in a review screen
- Ambiguous dates are clearly identified
- No tasks are saved before confirmation
- The user can edit every extracted field

### Task Decomposition

- The user can request a breakdown from any task
- The engine returns a measurable first action
- Suggested subtasks include estimated duration
- The user can select only some subtasks
- The original task remains available
- The engine does not overwrite the task without approval

### Next Best Action

- The system recommends one primary task
- The recommendation includes a concise reason
- The recommendation respects task deadlines
- The user can request an alternative
- The user can begin a timer directly
- Dismissed recommendations are recorded

### Schedule Repair

- The system detects when planned work exceeds available time
- Critical tasks are not moved beyond their deadline without confirmation
- Every proposed movement is visible
- Users can accept changes individually
- Accepted changes can be undone
- Rejected changes are not repeatedly proposed without new evidence

### Privacy Controls

- The engine can be disabled
- Personalised AI data can be reset
- Autonomy level can be changed
- Recent AI actions are visible
- AI-generated fields are distinguishable from user-entered data

---

## 21. Success Metrics

### 21.1 Activation Metrics

- Percentage of eligible users who enable the engine
- Percentage who complete the AI onboarding
- Percentage who use Intelligent Brain Dump
- Percentage who accept at least one recommendation

### 21.2 Engagement Metrics

- Daily Executive Brief view rate
- Next Best Action start rate
- Recommendation acceptance rate
- Recommendation dismissal rate
- Task-decomposition usage
- Schedule-repair usage
- Recovery Mode completion rate

### 21.3 Outcome Metrics

- Reduction in repeatedly postponed tasks
- Reduction in time between task creation and first session
- Improvement in planned-versus-completed workload accuracy
- Increase in tasks started from recommendations
- Increase in completion of previously avoided tasks
- Reduction in excessive daily rescheduling
- Improvement in user-reported decision fatigue

### 21.4 Trust Metrics

- Undo rate
- Automation disable rate
- Incorrect recommendation reports
- Percentage of recommendations rated helpful
- Percentage marked too intrusive
- Retention by autonomy level

### 21.5 Commercial Metrics

- Plus conversion after AI feature exposure
- Plus retention
- AI operating cost per active user
- AI cost per accepted recommendation
- Lifetime value compared with AI infrastructure cost

---

## 22. Guardrail Metrics

The team should monitor:

- Percentage of recommendations that conflict with deadlines
- Excessive notification rate
- Repeated dismissed recommendation rate
- Automatic-action reversal rate
- Hallucinated task or deadline rate
- Invalid structured-output rate
- AI latency
- Per-user model cost
- Sensitive-inference complaints
- User reports of increased pressure or anxiety

A feature should be suspended or degraded to advisory mode when guardrail thresholds are exceeded.

---

## 23. Performance Requirements

Suggested targets:

| Operation | Target |
|---|---:|
| Basic recommendation response | Under 3 seconds |
| Complex decomposition response | Under 8 seconds |
| Daily brief load from cache | Under 1 second |
| Brain-dump extraction | Under 5 seconds |
| Schedule repair | Under 8 seconds |

Additional requirements:

- Recommendation interface must remain usable during model failure
- Deterministic task and timer features must not depend on AI availability

---

## 24. Failure Handling

When AI services are unavailable:

- Existing TaskLaunch functionality must continue
- Cached recommendations may remain visible with timestamps
- The user should receive a clear, nontechnical message
- No partial AI action should modify task data
- Failed requests should be safely retryable
- Repeated model calls should be prevented
- The system should fall back to deterministic next-task ranking where possible

Example:

> Advanced planning is temporarily unavailable. TaskLaunch has selected a next task using your priorities, deadlines, and available time.

---

## 25. Onboarding Requirements

AI onboarding should explain:

1. What the engine does
2. What information it uses
3. What it will not infer
4. How recommendations are generated
5. How much control the user retains
6. The selected autonomy level
7. How to disable or reset the feature

Suggested onboarding question:

> How much should TaskLaunch handle for you?

Options:

- Suggest actions only
- Prepare changes for approval
- Automatically handle low-risk adjustments

The default should be **Suggest actions only**.

---

## 26. Open Questions

- Which AI provider or model combination provides the best cost-to-quality ratio?
- Which recommendations require real-time generation versus background generation?
- How many historical sessions are required before behavioural insights are displayed?
- Should AI features have daily fair-use limits?
- Which AI functions should be available to free users?
- Should personalisation data be stored as structured features, vector embeddings, or both?
- Which tasks should be processed using on-device models?
- How should model outputs be evaluated before production release?
- How should recommendations behave when users provide limited task metadata?
- Should capacity estimation be explicitly opted into?
- How long should recommendation and explanation records be retained?
- Which automatic actions are sufficiently low-risk for Trusted Automation?
- Should the engine support separate work, home, and personal behaviour profiles?

---

## 27. Key Risks

### Incorrect Recommendations

The engine may misunderstand task importance, duration, or context.

**Mitigation:** Confidence scoring, deadline rules, approval flows, explanations, undo.

### Over-Automation

Users may feel that the application is controlling their schedule.

**Mitigation:** Conservative defaults, autonomy settings, visible actions, easy disable controls.

### Increased Pressure

Frequent recommendations may make users feel monitored or judged.

**Mitigation:** Neutral language, recommendation limits, quiet modes, dismissal learning.

### Privacy Concerns

Behavioural analysis may feel intrusive.

**Mitigation:** Explicit onboarding, data minimisation, local calculations, granular settings.

### Model Cost

Frequent model calls may make the feature commercially unsustainable.

**Mitigation:** Caching, lightweight models, event batching, deterministic filtering, subscription limits.

### Hallucinated Details

The model may invent deadlines, dependencies, or task requirements.

**Mitigation:** Structured input, schema validation, source attribution, confirmation requirements.

### Cold-Start Quality

The system may have insufficient data for personal recommendations.

**Mitigation:** Use explicit preferences and general planning rules until sufficient history exists.

---

## 28. Recommended Initial Build Order

### Foundation

1. AI preference and consent model
2. Recommendation data model
3. Structured AI gateway
4. Schema validation
5. Recommendation audit history
6. Feedback tracking
7. Undo framework

### First User-Facing Capability

8. Intelligent Brain Dump
9. Task Clarification
10. Task Decomposition

### Planning Capability

11. Deterministic workload calculation
12. Next Best Action ranking
13. Daily Executive Brief
14. Schedule overload detection
15. Proposed schedule repair

### Personalisation

16. Behavioural feature aggregation
17. Recommendation feedback weighting
18. Duration prediction
19. Friction detection
20. Adaptive capacity

### Automation

21. Autonomy levels
22. Low-risk automatic actions
23. Notification intelligence
24. Recovery Mode
25. Calendar integration

---

## 29. MVP Release Definition

The MVP is ready for release when a user can:

1. Enter a natural-language brain dump
2. Review and create structured tasks
3. Request a breakdown of a difficult task
4. Receive one recommended next action
5. View a concise daily executive brief
6. Be warned when the daily plan is unrealistic
7. Review a proposed repaired schedule
8. Accept, reject, edit, and undo AI changes
9. Provide recommendation feedback
10. Disable the engine or reset its learned data

The MVP should not be considered complete unless every AI-generated modification is explainable, reviewable, and reversible.

---

## 30. Product Positioning

Recommended feature name:

# TaskLaunch Executive Function Engine

Supporting descriptions:

- Adaptive planning that reduces the effort of deciding what to do next.
- A productivity system that reorganises itself when real life changes.
- Practical executive-function support built into every task.
- Less planning, less reshuffling, and a clearer next step.
- TaskLaunch learns how you work and helps remove the friction between intention and action.

The feature should not be positioned primarily as a chatbot.

The central value proposition is:

> TaskLaunch does more of the planning work so the user can spend more of their available capacity making progress.
