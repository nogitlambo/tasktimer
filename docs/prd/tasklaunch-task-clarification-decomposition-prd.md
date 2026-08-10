# TaskLaunch AI Task Clarification and Decomposition

## Product Requirements Document

**Status:** Draft for implementation  
**Product:** TaskLaunch  
**Feature:** AI Task Clarification and Decomposition  
**Parent capability:** Executive Function Engine  
**Preceding feature:** Brain Dump Interface  
**Target platforms:** Responsive web and Android-compatible web UI  
**Primary stack:** Next.js, React, TypeScript, Firebase Authentication, Firestore, hosted server API, OpenAI API, Zod

---

## 1. Product Summary

The AI Task Clarification and Decomposition feature allows a user to select an existing TaskLaunch task and request help making it easier to understand and start.

The feature analyses the task title, supported task metadata, notes where available, scheduling context, and limited behavioural signals. It then proposes:

- A clearer task title
- A concise definition of done
- A practical first action
- An estimated duration or duration range
- Optional subtasks
- A suggested stopping point
- Ambiguity or missing-information warnings

The user must review and explicitly approve any change before the existing task is modified or new subtasks are created.

The feature must not replace the current Task model, create hidden work, or allow AI output to write directly to Firestore without validation and confirmation.

---

## 2. Product Principle

> Make the next step clearer, not the whole system more complicated.

The feature should reduce task-initiation friction without forcing every task into a project-management workflow.

The experience must remain optional, low friction, nonjudgmental, explainable, editable, reversible, and compatible with the existing TaskLaunch task model.

---

## 3. Problem Statement

Users frequently create tasks that accurately represent an intention but are not actionable enough to begin.

Examples include:

- Work on app
- Sort out tax
- Fix onboarding
- Research notifications
- Clean the house
- Prepare launch
- Deal with paperwork
- Organise school stuff

These tasks create several forms of friction:

- The completion condition is unclear
- The first action is not obvious
- The task may contain several independent actions
- The perceived effort is larger than the actual first step
- The task may repeatedly be postponed without meaningful progress
- The user must perform additional planning before starting

TaskLaunch should help users convert intent into a practical launch point.

---

## 4. Goals

### 4.1 Primary Goals

The feature must:

- Allow users to request clarification from an existing task
- Detect broad, vague, or multi-part task wording
- Suggest a clearer and more actionable title
- Generate a concrete first action
- Suggest a measurable definition of done
- Generate optional subtasks where useful
- Estimate task or subtask duration
- Preserve the original task until approval
- Allow users to accept only selected suggestions
- Support safe undo
- Store AI suggestions separately from confirmed task data
- Reuse the existing TaskLaunch task persistence layer

### 4.2 Secondary Goals

The feature should:

- Reduce time between task creation and first session
- Reduce repeated postponement
- Improve task-duration estimates
- Improve future Next Best Action quality
- Generate structured task intelligence for later Executive Function features
- Support tasks created manually or through Brain Dump
- Learn from accepted, edited, and rejected suggestions

### 4.3 Non-Goals

The MVP will not:

- Automatically rewrite tasks without confirmation
- Automatically create projects
- Generate nested subtasks
- Rearrange the user’s schedule
- Change deadlines automatically
- Diagnose procrastination, burnout, or executive dysfunction
- Analyse unrelated user data
- Create dependencies across multiple projects
- Act as a general chatbot
- Continuously monitor all tasks in the background
- Modify recurring-task rules

---

## 5. Core User Stories

### Clarify a Vague Task

As a user with a vague task, I want TaskLaunch to suggest clearer wording so that I understand what completion means.

### Generate a First Action

As a user struggling to begin, I want TaskLaunch to give me one small starting action so that I can start immediately.

### Break Down a Large Task

As a user with a broad task, I want TaskLaunch to propose manageable subtasks so that the work feels less overwhelming.

### Select Suggestions

As a user, I want to choose which AI suggestions are applied so that I remain in control.

### Preserve the Original

As a user, I want the original task to remain unchanged until I approve the proposal.

### Start Immediately

As a user who accepts a first action, I want to launch a timer directly from the result.

---

## 6. Primary User Flow

```text
Open an existing task
    ↓
Select "Make this easier to start"
    ↓
TaskLaunch gathers permitted task context
    ↓
Server sends structured request to AI provider
    ↓
AI returns a schema-constrained proposal
    ↓
Application validates response
    ↓
Review screen displays suggestions
    ↓
User edits and selects suggestions
    ↓
User confirms
    ↓
Existing task is updated and selected subtasks are created
    ↓
Success state offers Start now and Undo
```

---

## 7. Entry Points

The primary MVP entry point should be available from:

- Task card overflow menu
- Task details screen
- Task edit interface

Recommended label:

```text
Make this easier to start
```

Alternative compact label:

```text
Break down task
```

The feature should not initially appear automatically on every task.

---

## 8. Input Context

The MVP may send the following context to the AI service:

- Task title
- Task notes, if supported
- Current target duration
- Due date
- Task type
- Relevant task status
- Number of postponements, if available
- Number and duration of prior sessions for the same task
- User instruction, if supplied
- User timezone
- Current local date

The MVP must not send:

- The user’s full task history
- Unrelated task titles
- Friend or leaderboard data
- Private profile fields not needed for the request
- Raw Brain Dump source material
- Sensitive analytics identifiers
- Authentication credentials

---

## 9. User Instruction

The user may optionally specify what type of help they want.

Examples:

```text
Make the first step very small.
Break this into steps under 15 minutes.
Keep the original title.
I only have 20 minutes today.
Do not create subtasks.
Help me define what done looks like.
```

The instruction must be treated as a constraint, not as trusted executable input.

---

## 10. AI Output Requirements

The structured proposal may contain:

- Suggested title
- Definition of done
- Suggested first action
- Estimated total duration
- Estimated duration range
- Suggested stopping point
- Optional subtasks
- Task ambiguity score
- Initiation difficulty score
- Confidence score
- Reason codes
- Missing-information questions
- Warnings

The model must not invent deadlines, people, files, dependencies, or external requirements that are not grounded in the task context.

---

## 11. Decomposition Rules

The system should:

- Prefer 2–8 subtasks
- Keep subtasks independently understandable
- Use action-oriented titles
- Avoid duplicating the parent task as a subtask
- Avoid unnecessary micro-steps
- Keep durations realistic
- Respect user-requested duration limits
- Order subtasks logically
- Include only steps reasonably supported by context
- Flag assumptions rather than presenting them as facts
- Avoid external commitments unless explicitly present

Subtasks should generally be small enough to complete in one focused session.

---

## 12. Clarification Rules

The system should identify patterns such as:

- Topic-only wording
- No completion condition
- Multiple verbs in one task
- Unclear object
- Unclear scope
- Undefined research task
- Undefined preparation task
- Task that may actually represent a project
- Task that appears blocked by missing information

Supported reason codes:

```text
TASK_TOO_BROAD
NO_CLEAR_OUTCOME
MISSING_FIRST_ACTION
MULTIPLE_ACTIONS
UNCLEAR_SCOPE
UNCLEAR_OBJECT
RESEARCH_NOT_TIME_BOXED
POSSIBLE_PROJECT
MISSING_INFORMATION
FREQUENTLY_POSTPONED
DURATION_UNCERTAIN
```

---

## 13. Review Interface

The review interface is mandatory.

The original task must remain visible.

Recommended layout:

```text
Original task
Work on Play Store listing

Suggested title
Prepare Play Store listing assets

Definition of done
Required screenshots and listing copy are ready for upload.

Start here
Open the Play Console store-listing page.

Suggested steps
☑ Review current screenshots
☑ List missing assets
☐ Update short description
☐ Check feature graphic

Estimated total
45–60 minutes

[Keep original] [Apply selected changes]
```

The user must be able to:

- Keep or replace the original title
- Edit the suggested title
- Accept or omit the definition of done
- Edit the first action
- Select individual subtasks
- Edit subtask titles and durations
- Request smaller steps
- Regenerate once with revised instructions
- Cancel without changes
- Apply selected suggestions

---

## 14. Persistence Contract

Confirmed changes must use the existing TaskLaunch Task model and persistence service.

Persist only fields already supported by the current Task model and Firestore allowlist.

Keep these outside the Task document unless already supported:

- AI confidence
- Ambiguity score
- Initiation difficulty score
- Reason codes
- Original proposal text
- Model version
- Prompt version
- Rejected suggestions
- User feedback
- Definition of done
- First action

Store recommendations separately:

```text
users/{userId}/taskRecommendations/{recommendationId}
```

The record should link to:

- User ID
- Task ID
- Source task version
- Accepted fields
- Rejected fields
- Created subtask IDs
- Model version
- Prompt version
- Timestamp

Do not store raw model reasoning.

---

## 15. Suggested TypeScript Model

```ts
export type TaskClarificationStatus =
  | "ACTIVE"
  | "ACCEPTED"
  | "PARTIALLY_ACCEPTED"
  | "DISMISSED"
  | "EXPIRED"
  | "REVERSED";

export interface TaskClarificationSubtask {
  id: string;
  title: string;
  estimatedMinutes?: number | null;
  selected: boolean;
}

export interface TaskClarificationRecommendation {
  id: string;
  userId: string;
  taskId: string;
  sourceTaskVersion: string;
  status: TaskClarificationStatus;

  originalTitle: string;
  suggestedTitle?: string | null;
  definitionOfDone?: string | null;
  firstAction?: string | null;
  stoppingPoint?: string | null;

  estimatedMinutes?: number | null;
  estimatedRange?: {
    min: number;
    max: number;
  } | null;

  subtasks: TaskClarificationSubtask[];
  clarificationQuestions: string[];
  reasonCodes: string[];
  confidence: number;
  ambiguityScore: number;
  initiationDifficultyScore: number;

  acceptedFields: string[];
  rejectedFields: string[];
  createdSubtaskIds: string[];

  modelVersion: string;
  promptVersion: string;
  createdAt: string;
  respondedAt?: string | null;
  expiresAt: string;
}
```

---

## 16. Zod Output Schema

```ts
import { z } from "zod";

export const TaskClarificationReasonCodeSchema = z.enum([
  "TASK_TOO_BROAD",
  "NO_CLEAR_OUTCOME",
  "MISSING_FIRST_ACTION",
  "MULTIPLE_ACTIONS",
  "UNCLEAR_SCOPE",
  "UNCLEAR_OBJECT",
  "RESEARCH_NOT_TIME_BOXED",
  "POSSIBLE_PROJECT",
  "MISSING_INFORMATION",
  "FREQUENTLY_POSTPONED",
  "DURATION_UNCERTAIN"
]);

export const TaskClarificationSubtaskSchema = z.object({
  title: z.string().min(1).max(160),
  estimatedMinutes: z.number().int().min(1).max(480).nullable().optional()
});

export const TaskClarificationResponseSchema = z.object({
  suggestedTitle: z.string().min(1).max(160).nullable(),
  definitionOfDone: z.string().max(500).nullable(),
  firstAction: z.string().max(240).nullable(),
  stoppingPoint: z.string().max(240).nullable(),

  estimatedMinutes: z.number().int().min(1).max(1440).nullable(),
  estimatedRange: z.object({
    min: z.number().int().min(1).max(1440),
    max: z.number().int().min(1).max(1440)
  }).nullable(),

  subtasks: z.array(TaskClarificationSubtaskSchema).max(8),
  clarificationQuestions: z.array(z.string().min(1).max(240)).max(3),
  reasonCodes: z.array(TaskClarificationReasonCodeSchema),

  confidence: z.number().min(0).max(1),
  ambiguityScore: z.number().min(0).max(1),
  initiationDifficultyScore: z.number().min(0).max(1)
});
```

Business validation must ensure:

- Estimated range minimum does not exceed maximum
- Subtasks are not duplicates
- Subtasks do not duplicate the parent title
- Low-confidence output cannot trigger automatic changes
- Missing fields remain null rather than invented

---

## 17. AI Provider Interface

```ts
export interface TaskClarificationAIProvider {
  clarifyTask(input: {
    taskId: string;
    title: string;
    notes?: string;
    targetMinutes?: number;
    dueDate?: string;
    taskType?: string;
    postponementCount?: number;
    priorSessionSummary?: {
      sessionCount: number;
      totalMinutes: number;
      averageMinutes: number;
    };
    userInstruction?: string;
    timezone: string;
    currentDate: string;
  }): Promise<TaskClarificationResponse>;
}
```

The UI must not call the AI provider directly.

---

## 18. API Contracts

### Generate Recommendation

```http
POST /api/tasks/{taskId}/clarify
```

Request:

```json
{
  "instruction": "Break this into steps under 15 minutes."
}
```

Server responsibilities:

1. Authenticate user
2. Verify task ownership
3. Load allowed task context
4. Apply rate and entitlement checks
5. Call AI provider
6. Validate response
7. Apply business validation
8. Store recommendation
9. Return review payload

### Apply Recommendation

```http
POST /api/tasks/{taskId}/clarify/{recommendationId}/apply
```

Request:

```json
{
  "acceptedFields": ["suggestedTitle", "firstAction"],
  "selectedSubtasks": [
    {
      "recommendationSubtaskId": "sub_1",
      "title": "Review current screenshots",
      "estimatedMinutes": 10
    }
  ],
  "editedValues": {
    "suggestedTitle": "Prepare Play Store assets"
  },
  "idempotencyKey": "uuid"
}
```

### Dismiss Recommendation

```http
POST /api/tasks/{taskId}/clarify/{recommendationId}/dismiss
```

### Undo Recommendation

```http
POST /api/tasks/{taskId}/clarify/{recommendationId}/undo
```

---

## 19. Ownership, Concurrency, and Undo

Requirements:

- Only the task owner may generate or apply a recommendation
- Shared-task behaviour must follow existing permissions
- Recommendation ownership must be enforced server-side
- The recommendation must record the source task version
- If the task changes after generation, applying must be blocked
- Repeated apply requests must be idempotent

Suggested stale-state message:

```text
This task changed after the suggestion was created. Review the latest version before applying it.
```

Undo should restore original supported task fields and remove only untouched newly created subtasks.

Recommended undo window:

```text
30 seconds
```

---

## 20. Failure Handling

### AI or Schema Failure

- Preserve the existing task
- Do not display partial output
- Allow retry
- Retry automatically at most once
- Do not expose provider errors

Suggested message:

```text
TaskLaunch could not prepare a reliable breakdown. Your task has not been changed.
```

### Apply Failure

- Use an atomic write where supported
- Prevent duplicates on retry
- Preserve the recommendation for recovery
- Return exact successful and failed changes if partial failure is unavoidable

### Stale Task

- Block apply
- Offer regeneration
- Never overwrite newer task values

---

## 21. Privacy and Analytics

Do not place task content in analytics or logs.

Safe telemetry may include:

```text
task_clarification_opened
task_clarification_requested
task_clarification_completed
task_clarification_failed
task_clarification_reviewed
task_clarification_title_accepted
task_clarification_first_action_accepted
task_clarification_subtask_selected
task_clarification_subtask_edited
task_clarification_regenerated
task_clarification_applied
task_clarification_dismissed
task_clarification_undone
task_clarification_stale_blocked
```

Safe properties include model version, prompt version, latency, cost bucket, accepted field count, selected subtask count, and error category.

Do not log:

- Task title
- Task notes
- Generated subtask text
- User instruction
- Definition of done
- First action

---

## 22. Success Metrics

Primary MVP success metric:

> Percentage of applied recommendations followed by a task session within 10 minutes.

Additional metrics:

- Recommendation acceptance rate
- Partial-acceptance rate
- Percentage of suggested titles edited
- Percentage of subtasks retained
- Dismissal rate
- Regeneration rate
- Undo rate
- Reduction in postponement after clarification
- Completion rate of clarified tasks
- Cost per accepted recommendation
- Schema failure rate

---

## 23. MVP Scope

### Included

- Manual “Make this easier to start” action
- Existing-task analysis
- Suggested title
- Definition of done
- First action
- Suggested stopping point
- Duration estimate
- Up to eight flat subtasks
- Optional user instruction
- Mandatory review
- Selective application
- Existing Task model persistence
- Recommendation audit record
- Stale-task protection
- Idempotency
- Safe undo
- Analytics
- Unit, integration, and end-to-end tests

### Excluded

- Automatic friction detection
- Proactive recommendations
- Nested subtasks
- Project generation
- Cross-task dependencies
- Automatic schedule changes
- Automatic deadline changes
- Multi-turn coaching
- Long-term personalisation
- Voice input
- Image input

---

## 24. Ordered Build Plan

### Phase 1: Foundation

1. Confirm persistence mapping against the current Task model
2. Define recommendation Firestore schema
3. Create Zod output schema
4. Create AI provider interface
5. Add prompt versioning
6. Add task ownership checks
7. Add source-task versioning
8. Add analytics wrappers
9. Add idempotency support
10. Add audit and undo model

Completion condition:

```text
A server-side test can submit an owned task and receive a validated recommendation without changing the task.
```

### Phase 2: Recommendation Generation

1. Add task-menu entry point
2. Build clarification modal or page
3. Add optional user instruction
4. Add generate endpoint
5. Add loading and error states
6. Store recommendation
7. Display original and proposed values
8. Handle clarification questions
9. Add one controlled regeneration
10. Add generation tests

### Phase 3: Selective Application

1. Add title acceptance and editing
2. Add definition-of-done selection
3. Add first-action selection
4. Add subtask selection and editing
5. Add duration editing
6. Add apply endpoint
7. Use existing task persistence service
8. Add created-subtask provenance
9. Add idempotency
10. Add success state

### Phase 4: Safety and Recovery

1. Add stale-task detection
2. Add atomic or recoverable apply logic
3. Add safe undo
4. Add partial-failure handling
5. Add expiry
6. Add access-control tests
7. Add telemetry redaction tests
8. Add accessibility tests
9. Add end-to-end tests
10. Add evaluation dataset

---

## 25. Acceptance Criteria

- An eligible task exposes the clarification action
- The user can generate a validated proposal
- The original task remains unchanged before confirmation
- Suggestions are editable and selectively applicable
- Confirmed fields use the existing Task model
- Selected subtasks are created without duplication
- Unsupported metadata remains outside the Task document
- Ownership is enforced
- Stale recommendations cannot overwrite newer changes
- Apply is idempotent
- Safe undo works
- Analytics exclude task content
- Accessibility requirements are met
- Unit, integration, and end-to-end tests pass

---

## 26. Recommended Product Copy

### Task Action

```text
Make this easier to start
```

### Modal Title

```text
Make this task clearer
```

### Supporting Copy

```text
TaskLaunch can suggest a clearer outcome, a small first action, and optional steps. Nothing changes until you approve it.
```

### Instruction Placeholder

```text
Optional: Tell TaskLaunch how you want this broken down.
```

### Generate Button

```text
Prepare suggestions
```

### Apply Button

```text
Apply selected changes
```

### Cancel Action

```text
Keep original
```

### Success

```text
Task updated. Your selected steps are ready.
```

---

## 27. Codex Implementation Rules

1. Inspect the current repository and Task model before modifying code.
2. Reuse existing task services, Firebase utilities, components, and design tokens.
3. Do not create a parallel task model.
4. Do not call the AI provider from the browser.
5. Validate every AI response with Zod.
6. Do not modify the task before explicit confirmation.
7. Keep AI metadata outside the Task document unless already supported.
8. Use deterministic code for ownership, persistence, idempotency, stale checks, and undo.
9. Keep provider-specific code behind an interface.
10. Do not log task content.
11. Add one observable failing test before each behaviour.
12. Implement only MVP scope.
13. Preserve existing task behaviour when AI is unavailable.
14. Document deviations from this PRD.
15. Do not implement proactive friction detection in this feature.

---

## 28. Definition of Done

The MVP is complete when:

- An eligible task exposes the clarification action
- The user can generate and review a validated proposal
- No task changes occur before confirmation
- Suggestions can be edited and selectively applied
- Existing TaskLaunch persistence is reused
- Selected subtasks are created idempotently
- Ownership and stale-state checks are enforced
- Safe undo works
- Analytics exclude task content
- Accessibility requirements are met
- Unit, integration, and end-to-end tests pass

---

## 29. Recommended First Codex Task

```text
Build the TaskLaunch AI Task Clarification foundation.

Requirements:
- Inspect the existing Task model, Firestore allowlist, task persistence services, and task-card action patterns.
- Add a manual "Make this easier to start" action for owned active tasks.
- Add a server-side task clarification endpoint.
- Add a provider-independent AI interface and OpenAI implementation.
- Return strict structured output validated with Zod.
- Store the proposal as a user-owned recommendation record.
- Display the original task and read-only suggestions in a review interface.
- Do not apply changes or create subtasks in this first implementation slice.
- Add ownership, schema-validation, task-unchanged-before-confirmation, stale-source-version, and redacted-telemetry tests.
- Follow incremental TDD.
```
