# TaskLaunch Brain Dump Interface

## Product Requirements Document

**Status:** Ready for implementation  
**Product:** TaskLaunch  
**Feature:** Brain Dump Interface  
**Parent capability:** Executive Function Engine  
**Target platforms:** Responsive web and Android-compatible web UI  
**Primary stack:** Next.js, React, TypeScript, Firebase Authentication, Firestore, Firebase Storage, Cloud Functions or Cloud Run, OpenAI API, Zod

---

## 1. Product Summary

The Brain Dump interface allows users to capture unstructured thoughts through text, recorded voice, or an uploaded image and convert them into structured, editable task suggestions.

The user must review and confirm all proposed tasks before they are added to TaskLaunch.

The feature is designed to reduce the executive effort required to:

- Remember multiple commitments
- Separate several actions from one stream of thought
- Identify deadlines
- Clarify vague intentions
- Estimate task effort
- Determine a useful first action
- Convert screenshots, notes, and voice recordings into tasks

The Brain Dump interface is not a general-purpose chatbot. Its purpose is structured task capture.

---

## 2. Product Principle

> Capture first. Organise second.

Users should not need to structure their thoughts before entering them.

The feature must remain:

- Low friction
- Mobile friendly
- Nonjudgmental
- Explainable
- Reversible
- Privacy conscious
- Independent of any one AI provider at the application layer

---

## 3. Problem Statement

Traditional task-entry workflows require users to organise their thoughts before they can create a task.

This creates friction for users who:

- Have several thoughts at once
- Find forms cognitively demanding
- Use screenshots or voice notes as reminders
- Create vague tasks that are difficult to start
- Forget dates and commitments
- Struggle to separate ideas from actions

TaskLaunch should allow users to unload their thoughts first and organise them afterward.

---

## 4. Goals

### Primary Goals

The feature must:

- Support typed text, voice recordings, and images
- Extract multiple tasks from one submission
- Preserve explicit dates, names, quantities, and deadlines
- Suggest clear task titles
- Suggest useful first actions
- Estimate task duration where reasonable
- Identify uncertain or ambiguous items
- Provide a complete review step
- Allow editing before creation
- Require explicit confirmation before saving
- Integrate with the existing TaskLaunch task model

### Secondary Goals

The feature should:

- Improve task quality at creation time
- Reduce duplicate tasks
- Support mobile-first capture
- Reduce time spent manually entering tasks
- Provide a foundation for future conversational planning
- Support future Android share actions and home-screen capture

### Non-Goals

The MVP will not:

- Automatically create tasks without confirmation
- Provide continuous background listening
- Send messages or emails
- Modify calendar events
- Import entire inboxes
- Diagnose mental or emotional states
- Store source files indefinitely
- Act as a general AI assistant
- Generate complex project plans
- Support realtime two-way voice conversation

---

## 5. Target Users

### Primary User

A user who:

- Has multiple tasks in mind
- Struggles to organise thoughts before entering them
- Finds task-entry forms burdensome
- Uses voice notes or screenshots as reminders
- Frequently creates vague tasks
- Benefits from external structure

### Secondary User

A user who wants to:

- Capture tasks quickly while mobile
- Convert handwritten notes into tasks
- Extract tasks from screenshots
- Dictate tasks while occupied
- Turn rough ideas into actionable items

---

## 6. MVP Scope

### Included

- Typed Brain Dump
- Recorded voice Brain Dump
- Single-image upload
- Optional typed instruction
- Audio transcription
- Image interpretation
- Structured task extraction
- Editable review screen
- Select or deselect proposed tasks
- Date extraction
- Estimated duration suggestions
- First-action suggestions
- Basic duplicate warnings
- Batch task creation
- Undo support
- Analytics events
- Source-file cleanup
- Error and retry handling

### Excluded

- Realtime conversational voice
- Multiple-image analysis
- Calendar integration
- Email import
- Automatic task creation
- Full document processing
- Background capture
- Multi-agent workflows
- On-device AI
- Shared Brain Dumps

---

## 7. User Stories

### Typed Capture

As a user with several unstructured thoughts, I want to type naturally so that TaskLaunch can separate them into individual tasks.

### Voice Capture

As a user who does not want to type, I want to record a voice note so that TaskLaunch can transcribe and organise it.

### Image Capture

As a user with a screenshot or handwritten list, I want to upload it so that TaskLaunch can identify possible tasks.

### Combined Input

As a user uploading an image, I want to add instructions so that TaskLaunch knows what to extract or ignore.

### Review

As a user, I want to review and edit extracted tasks before they are created.

### Fast Save

As a user satisfied with the extracted tasks, I want to create all selected items in one action.

---

## 8. Primary User Flow

```text
Open Brain Dump
    ↓
Enter text, record voice, or upload image
    ↓
Optionally add instructions
    ↓
Submit input
    ↓
Upload source files
    ↓
Transcribe audio where required
    ↓
Interpret image where required
    ↓
Normalise source content
    ↓
Extract proposed tasks
    ↓
Validate structured AI response
    ↓
Resolve dates and check duplicates
    ↓
Display review screen
    ↓
User edits and selects tasks
    ↓
User confirms creation
    ↓
Create tasks in Firestore
    ↓
Display success summary and undo
```

---

## 9. Entry Points

The Brain Dump interface should be accessible from:

- Dashboard
- Tasks page
- Add Task menu
- Main floating action button
- Empty task-list state
- Mobile quick-action menu

Recommended route:

```text
/brain-dump
```

Recommended entry label:

```text
Brain Dump
```

---

## 10. Capture Interface

### Page Title

```text
Clear your head
```

### Supporting Copy

```text
Add everything that needs attention. Type it, say it, or add an image. TaskLaunch will organise it into tasks for you to review.
```

### Input Modes

```text
[ Type ] [ Speak ] [ Add image ]
```

Requirements:

- Switching modes must not discard existing input
- Combined inputs must be supported
- Submit must remain disabled until usable input exists
- Drafts should survive recoverable navigation and failures

---

## 11. Typed Input Requirements

The typed mode must include:

- Multiline textarea
- Paste support
- Character limit
- Character counter near the limit
- Local draft persistence
- Clear-draft action
- Optional image attachment
- Optional typed instruction

Recommended placeholder:

```text
Type whatever is on your mind. It does not need to be organised.
```

Recommended maximum:

```text
20,000 characters
```

Recommended submit label:

```text
Organise this
```

---

## 12. Voice Input Requirements

The voice mode must support:

- Start recording
- Pause
- Resume
- Stop
- Cancel
- Playback before submission
- Recording timer
- Microphone permission handling
- Audio-level feedback
- Upload progress
- Editable transcript
- Retry after failure

Recommended maximum recording duration:

```text
5 minutes
```

Preferred browser output:

```text
audio/webm
```

Recommended guidance:

```text
Speak naturally. Include anything you need to do, remember, or follow up.
```

Voice processing flow:

```text
Recorded audio
    ↓
Speech-to-text model
    ↓
Editable transcript
    ↓
Structured task extraction model
```

---

## 13. Image Input Requirements

The image mode must support:

- File upload
- Camera capture on supported mobile devices
- Preview
- Remove
- Replace
- MIME-type validation
- File-size validation
- Optional typed instructions

Supported formats:

```text
image/jpeg
image/png
image/webp
```

Recommended maximum size:

```text
10 MB
```

Recommended instruction placeholder:

```text
Tell TaskLaunch what to extract or ignore.
```

MVP image limit:

```text
1 image per Brain Dump
```

---

## 14. Processing States

The UI should show staged progress.

Suggested states:

```text
Uploading your input
Converting speech to text
Reviewing the image
Separating possible tasks
Preparing your task list
```

The UI must not show completion until:

- AI processing succeeds
- Structured output validation succeeds
- Date processing completes
- Duplicate checks complete

---

## 15. Extraction Requirements

For each proposed item, the system may extract or suggest:

- Item type
- Task title
- Notes
- Due date
- Due time
- Estimated duration
- Priority
- Project
- Recurrence
- First action
- Subtasks
- Dependencies
- Energy requirement
- Concentration requirement
- Source evidence
- Confidence
- Ambiguity flags

The AI must not invent values merely to populate the schema.

---

## 16. Supported Item Types

```text
TASK
REMINDER
SHOPPING_ITEM
PROJECT
NOTE
EVENT
REFERENCE
UNCERTAIN
NOT_ACTIONABLE
```

For the MVP, TaskLaunch may directly create:

- Tasks
- Reminders
- Shopping items

Unsupported item types may be shown for review but should not be created unless the existing TaskLaunch data model supports them.

---

## 17. Extraction Rules

The system must:

- Separate independent actions into separate items
- Preserve explicit names, dates, quantities, and deadlines
- Avoid assigning dates where none were implied
- Distinguish ideas from commitments
- Avoid converting contextual statements into tasks
- Preserve uncertainty
- Avoid duplicate items within the same Brain Dump
- Suggest a first action only where useful
- Use neutral language
- Avoid medical or psychological inference

---

## 18. Date Handling

The system must support:

- Explicit dates
- Relative dates
- Weekdays
- Time windows
- Approximate dates
- Recurring schedules
- Dependency-based timing

Examples:

```text
Tomorrow
Before Thursday
This weekend
By the end of August
Every second Monday
After Sarah replies
```

Requirements:

- Resolve dates using the user timezone
- Preserve the original date text
- Display the resolved date during review
- Flag ambiguous dates
- Never silently choose between multiple plausible dates

Store both:

```text
dueDateText
resolvedDueDate
```

---

## 19. Ambiguity Handling

Supported ambiguity flags:

```text
MISSING_SUBJECT
UNCLEAR_PERSON
UNCLEAR_DATE
CONFLICTING_DATE
VAGUE_OUTCOME
POSSIBLE_DUPLICATE
UNCLEAR_ACTIONABILITY
MISSING_DEPENDENCY
UNCERTAIN_RECURRENCE
```

Ambiguous items must:

- Display a warning
- Remain editable
- Allow save-as-is
- Allow exclusion
- Avoid blocking unrelated items

Suggested label:

```text
Needs review
```

---

## 20. Review Screen

The review screen is mandatory.

No item may be created before review in the MVP.

### Review Header

Example:

```text
I found 5 possible tasks. 1 needs a quick check.
```

### Task Card Fields

Each proposed item card should support:

- Select or deselect
- Editable title
- Editable notes
- Editable due date
- Editable duration
- Editable priority
- Editable project
- Editable first action
- Editable subtasks
- Ambiguity warning
- Duplicate warning
- Remove from review
- Expandable source evidence

Optional fields should remain collapsed by default.

### Primary Action

```text
Create 5 tasks
```

The count must update dynamically.

---

## 21. Duplicate Detection

Duplicate checks should compare proposed items against:

- Existing active tasks
- Recently completed tasks
- Other items in the same Brain Dump
- Archived tasks where useful

Signals may include:

- Similar title
- Same due date
- Similar notes
- Same project
- Shared names or entities

MVP actions:

```text
Create anyway
Skip
```

Duplicate detection must remain advisory.

---

## 22. Task Creation

When the user confirms:

1. Validate all selected items
2. Confirm user ownership
3. Recheck duplicates
4. Use idempotency protection
5. Create tasks using existing TaskLaunch task services
6. Store Brain Dump source metadata
7. Update the Brain Dump session
8. Display success summary
9. Offer safe undo

The feature must not create a parallel task model.

Suggested task metadata:

```ts
{
  source: "BRAIN_DUMP",
  sourceBrainDumpId: string,
  sourceBrainDumpItemId: string,
  aiGeneratedFields: string[]
}
```

Do not store raw transcripts or image data in task documents.

---

## 23. Undo Behaviour

Recommended undo window:

```text
30 seconds
```

Undo may remove only tasks that remain safe to delete.

Safe removal conditions:

- Not started
- Not completed
- Not shared
- Not materially edited
- No dependent records

---

## 24. Suggested Technical Architecture

```text
Client UI
    ↓
Authenticated server endpoint
    ↓
Source upload validation
    ↓
Transcription or image interpretation
    ↓
AI provider abstraction
    ↓
Structured output
    ↓
Zod validation
    ↓
Date normalisation
    ↓
Duplicate detection
    ↓
Firestore review session
    ↓
User confirmation
    ↓
Existing TaskLaunch task service
```

The client must never call OpenAI directly.

---

## 25. Suggested File Structure

```text
src/
  app/
    brain-dump/
      page.tsx
      loading.tsx
      error.tsx

  components/
    brain-dump/
      BrainDumpShell.tsx
      BrainDumpModeTabs.tsx
      BrainDumpTextInput.tsx
      BrainDumpVoiceRecorder.tsx
      BrainDumpImageUpload.tsx
      BrainDumpInstructionInput.tsx
      BrainDumpProcessingState.tsx
      BrainDumpReview.tsx
      BrainDumpTaskCard.tsx
      BrainDumpSuccess.tsx
      BrainDumpErrorState.tsx
      DuplicateTaskWarning.tsx

  features/
    brain-dump/
      hooks/
      lib/
      schemas/
      types/

  app/
    api/
      brain-dump/
        create/route.ts
        process/route.ts
        tasks/route.ts
        undo/route.ts

  ai/
    ai-provider.ts
    ai-provider-factory.ts
    providers/
      openai-provider.ts
```

Adapt this to the existing repository conventions.

---

## 26. Core TypeScript Types

```ts
export type BrainDumpInputType = "text" | "voice" | "image";

export type BrainDumpStatus =
  | "draft"
  | "uploading"
  | "transcribing"
  | "analysing"
  | "review"
  | "creating"
  | "completed"
  | "failed"
  | "undone";

export type BrainDumpItemType =
  | "TASK"
  | "REMINDER"
  | "SHOPPING_ITEM"
  | "PROJECT"
  | "NOTE"
  | "EVENT"
  | "REFERENCE"
  | "UNCERTAIN"
  | "NOT_ACTIONABLE";
```

---

## 27. Zod Output Schema

All AI output must be validated before being stored or displayed.

```ts
import { z } from "zod";

export const BrainDumpExtractedItemSchema = z.object({
  type: z.enum([
    "TASK",
    "REMINDER",
    "SHOPPING_ITEM",
    "PROJECT",
    "NOTE",
    "EVENT",
    "REFERENCE",
    "UNCERTAIN",
    "NOT_ACTIONABLE"
  ]),
  title: z.string().min(1).max(160),
  notes: z.string().max(2000).nullable().optional(),
  dueDateText: z.string().max(160).nullable().optional(),
  resolvedDueDate: z.string().nullable().optional(),
  estimatedMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).nullable().optional(),
  firstAction: z.string().max(240).nullable().optional(),
  sourceEvidence: z.string().max(500).nullable().optional(),
  confidence: z.number().min(0).max(1),
  ambiguities: z.array(z.string()).default([])
});

export const BrainDumpExtractionResponseSchema = z.object({
  summary: z.object({
    possibleTaskCount: z.number().int().min(0),
    uncertainItemCount: z.number().int().min(0)
  }),
  items: z.array(BrainDumpExtractedItemSchema).max(50)
});
```

Invalid AI output must never reach task creation logic.

---

## 28. AI Provider Interface

```ts
export interface BrainDumpAIProvider {
  transcribeAudio(input: {
    filePath: string;
    mimeType: string;
    language?: string;
  }): Promise<{
    transcript: string;
    detectedLanguage?: string;
  }>;

  extractTasks(input: {
    sourceText?: string;
    transcript?: string;
    imagePaths?: string[];
    instructionText?: string;
    timezone: string;
    currentDate: string;
  }): Promise<BrainDumpExtractionResponse>;
}
```

The application must depend on this interface rather than the OpenAI SDK directly.

---

## 29. Prompt Requirements

Create a versioned prompt with the identifier:

```text
brain-dump-v1
```

Core rules:

```text
You extract actionable items from user-provided text, transcripts, and image content.

Requirements:
- Return only data matching the supplied schema.
- Separate independent actions into separate items.
- Preserve explicit names, dates, quantities, and deadlines.
- Do not invent deadlines.
- Do not invent tasks merely to complete the schema.
- Distinguish tasks from notes, events, projects, reminders, and non-actionable context.
- Use the user's timezone and current date when resolving relative dates.
- Preserve uncertainty using ambiguity flags.
- Include concise source evidence for extracted dates or critical details.
- Suggest a first action only when it materially improves task initiation.
- Use neutral, nonjudgmental language.
- Avoid medical or psychological inference.
- Mark low-confidence items as uncertain.
```

---

## 30. API Contracts

### Create Session

```http
POST /api/brain-dump/create
```

### Process Session

```http
POST /api/brain-dump/process
```

The server must:

1. Verify Firebase Authentication
2. Verify ownership
3. Validate source files
4. Transcribe audio where required
5. Call the AI provider
6. Validate structured output
7. Resolve dates
8. Run duplicate checks
9. Save review items
10. Return the review payload

### Create Selected Tasks

```http
POST /api/brain-dump/tasks
```

Must use an idempotency key.

### Undo Batch

```http
POST /api/brain-dump/undo
```

---

## 31. Firestore Data Model

### Brain Dump Session

```text
users/{userId}/brainDumps/{brainDumpId}
```

### Extracted Items

```text
users/{userId}/brainDumps/{brainDumpId}/items/{itemId}
```

### Source Files

```text
users/{userId}/brainDumps/{brainDumpId}/{fileId}
```

Files must not be public.

---

## 32. Privacy and Retention

Default behaviour:

- Delete source audio and images after processing and review expiry
- Retain only the minimum source evidence needed for review
- Exclude raw content from analytics
- Exclude sensitive source data from logs
- Keep provider credentials server-side
- Clean up abandoned uploads
- Allow cancellation before task creation
- Use Firestore TTL where appropriate

Recommended retention:

```text
Unfinished session: 7 days
Completed session source files: delete within 24 hours
Review metadata: retain according to TaskLaunch history policy
```

---

## 33. Error Handling

Requirements:

- Preserve recoverable source input
- Never create partial tasks after extraction failure
- Retry AI processing automatically at most once
- Prevent duplicate task creation during retry
- Return actionable error messages
- Keep raw user content out of logs

---

## 34. Accessibility Requirements

The interface must support:

- Keyboard navigation
- Screen readers
- Visible focus states
- Large touch targets
- Recording-state announcements
- Editable transcript
- High contrast
- Reduced motion
- Error summaries
- No colour-only warnings
- Accessible selection controls

---

## 35. Analytics Events

Do not log raw user content.

Track:

```text
brain_dump_opened
brain_dump_mode_selected
brain_dump_submitted
brain_dump_transcription_completed
brain_dump_transcription_failed
brain_dump_extraction_completed
brain_dump_extraction_failed
brain_dump_review_opened
brain_dump_item_selected
brain_dump_item_edited
brain_dump_item_removed
brain_dump_duplicate_detected
brain_dump_tasks_created
brain_dump_creation_partially_failed
brain_dump_undone
brain_dump_abandoned
```

---

## 36. Performance Targets

| Operation | Target |
|---|---:|
| Capture screen load | Under 1 second after app shell |
| Typed extraction | Under 5 seconds |
| Single-image extraction | Under 8 seconds |
| Audio upload start | Under 1 second |
| Five-minute transcription | Under 20 seconds under normal conditions |
| Review render | Under 1 second after validation |
| Batch task creation | Under 3 seconds |

---

## 37. Acceptance Criteria

### Typed Input

- User can enter multiline text
- Multiple tasks can be extracted
- Draft survives recoverable failure
- Empty input cannot be submitted
- No task is saved before review

### Voice Input

- User can record, pause, resume, stop, cancel, and submit
- Transcript is editable
- Failed transcription cannot create tasks

### Image Input

- User can upload or capture one image
- User can preview, remove, and replace it
- Invalid files are rejected
- Unclear images return actionable feedback

### Extraction

- AI output passes strict validation
- Independent tasks are separated
- Explicit dates and names are preserved
- Uncertain items are flagged
- Missing values are not invented

### Review

- Every item can be selected or excluded
- Titles and dates can be edited
- Duplicate warnings remain advisory
- Selected tasks can be created in one action

### Task Creation

- Existing TaskLaunch task services are used
- Creation is idempotent
- Selected tasks are created
- Unselected tasks are not created
- Safe undo is available

### Privacy

- Source files are user scoped
- API keys remain server side
- Raw content is excluded from analytics
- Source files expire

---

## 38. Ordered Build Plan

### Phase 1: Foundation

1. Create TypeScript types
2. Create Zod schemas
3. Create Firestore collections
4. Create Storage paths and rules
5. Create AI provider interface
6. Create OpenAI provider
7. Create prompt versioning
8. Create processing service
9. Create idempotency support
10. Create analytics wrappers

### Phase 2: Typed MVP

1. Add `/brain-dump` route
2. Build capture shell
3. Add typed input
4. Add local draft persistence
5. Add process endpoint
6. Build review screen
7. Add editable task cards
8. Add selection controls
9. Add batch creation
10. Add success state
11. Add undo
12. Add error states

### Phase 3: Voice

1. Add microphone permission flow
2. Add recorder hook
3. Add recording controls
4. Add playback
5. Upload audio securely
6. Add transcription
7. Add transcript review
8. Reuse the extraction pipeline

### Phase 4: Image

1. Add image picker and camera capture
2. Add validation
3. Add preview and remove
4. Add instruction input
5. Upload securely
6. Add vision processing
7. Reuse the extraction pipeline
8. Add cleanup

---

## 39. Testing Requirements

### Unit Tests

Cover:

- Zod schemas
- Date resolution
- Duplicate scoring
- Task conversion
- Idempotency
- Undo eligibility
- File validation
- Provider error translation

### Integration Tests

Cover:

- Typed submission to review
- Voice upload to transcript
- Image upload to review
- Firestore ownership checks
- Batch task creation
- Partial failure handling
- Undo
- Expired sessions

### End-to-End Tests

Cover:

1. Typed Brain Dump creates two tasks
2. User edits one title
3. User excludes one item
4. User corrects a relative date
5. Duplicate warning does not block creation
6. Voice transcript can be edited
7. Invalid image is rejected
8. Schema failure preserves input
9. Retry does not duplicate tasks
10. Undo removes only safe tasks

---

## 40. Codex Implementation Rules

When implementing:

1. Inspect the existing repository before modifying code.
2. Reuse existing TaskLaunch components, tokens, Firebase utilities, task services, and analytics.
3. Do not create a parallel task model.
4. Do not call OpenAI from the browser.
5. Validate every AI response with Zod.
6. Do not write AI output directly into task documents.
7. Preserve source input after recoverable failures.
8. Use idempotency for task creation.
9. Keep raw content out of logs and analytics.
10. Keep provider-specific code behind the AI provider interface.
11. Use deterministic code for dates, permissions, duplicate checks, writes, and undo.
12. Implement the typed MVP before voice and image.
13. Do not implement excluded features without explicit approval.
14. Document any deviations from this PRD.

---

## 41. Definition of Done

The MVP is complete when:

- Typed input works end to end
- Recorded voice works end to end
- Single-image input works end to end
- Every AI response is schema validated
- No task is created without confirmation
- Review items are editable
- Existing TaskLaunch task services are used
- Creation is idempotent
- Safe undo works
- Source files are secured and expired
- Recoverable failures preserve user input
- Analytics exclude raw content
- Accessibility requirements are met
- Unit, integration, and end-to-end tests pass

---

## 42. Recommended First Codex Task

```text
Build the TaskLaunch typed Brain Dump MVP.

Requirements:
- Inspect the existing repository and reuse current architecture and UI patterns.
- Add the /brain-dump route.
- Add a multiline text input with local draft persistence.
- Add a server-side Brain Dump processing endpoint.
- Add an AI provider abstraction and OpenAI provider.
- Return strict structured JSON validated with Zod.
- Store a Brain Dump review session in Firestore.
- Build an editable review screen.
- Allow users to select proposed tasks.
- Create selected tasks through the existing TaskLaunch task service.
- Add idempotency and safe undo.
- Add loading, empty, error, and success states.
- Add analytics without raw user content.
- Add unit and end-to-end tests.
- Do not implement voice or image input in this first task.
```
