# ADR 0001: Brain Dump Product And Integration Contract

## Status

Approved for issue #53.

## Context

Brain Dump is the first TaskLaunch Executive Function Engine capability. Users submit unstructured thoughts and receive a reviewable set of extracted items. No extracted item may change the user's TaskTimer workspace until the user explicitly confirms it.

TaskLaunch currently persists tasks through the local-first TaskTimer workspace repository and synchronises to Firestore task documents with a strict task-field allowlist. Android/native static exports reach hosted TaskLaunch functionality through authenticated hosted API endpoints. Brain Dump must fit those boundaries instead of introducing a parallel task store or letting the client call an AI provider directly.

## Decision

### MVP Item Types

For the typed Brain Dump MVP, only extracted items that can be represented by the existing Task model may be confirmed and created as tasks.

The extraction layer may identify and display richer item types, including `project`, `recurrence`, `dependency`, `location`, `energy`, `subtask`, `note`, `event`, and `reference`. These item types are review-only unless a later issue maps them safely to an existing supported Task field.

Unsupported items must remain visible in review, be clearly labelled as unsupported or requiring review, default to unselected, never be silently converted into a generic task, and never be discarded without being shown to the user. Subtasks remain review-only for the initial typed MVP unless the current Task model supports them natively.

### Primary Entry Point

The typed MVP has one primary in-app entry point:

- web: the executive function image in the app shell header
- native/Android: the executive function image in the TaskLaunch top bar

The entry point is labelled `Brain Dump`, routes to `/brain-dump`, and reuses TaskLaunch navigation, authentication, and responsive styling conventions.

### Supported Task Persistence

Confirmed Brain Dump tasks persist only fields currently supported by the existing Task model and Firestore allowlist. Supported fields include:

- `name`
- `taskType`
- `onceOffTargetDate` and other currently supported schedule fields
- `timeGoal*` duration fields
- ordering fields
- existing default Task fields

Notes are persisted only if notes are already a supported Task field. Brain Dump must not introduce a new Task field solely to store notes.

The following fields remain on the Brain Dump session, item, or batch record rather than the Task document:

- raw source text
- source evidence
- AI confidence
- ambiguity flags
- original extracted wording
- unsupported field suggestions
- model version
- prompt version
- extraction metadata

Minimal provenance may be written to created tasks only if the existing Task model and Firestore allowlist already support it. Preferred provenance fields are `source = BRAIN_DUMP`, `sourceBrainDumpId`, and `sourceBrainDumpItemId`. If those fields are unsupported, provenance stays in the Brain Dump batch record, which maps each extracted item to its `createdTaskId`.

### Date Provenance

Date concepts stay distinct through extraction, review, and creation:

- `originalDateText`: wording found in the source
- `dateSource`: `explicit`, `inferred`, `suggested`, or `none`
- `timezone`: timezone used for interpretation
- `resolvedDate`: normalised reviewed date value
- `dateConfidence` or ambiguity state
- `userConfirmedDate`: whether the user reviewed or changed the date

Explicit source dates remain explicit. AI-suggested dates are labelled as suggestions and never represented as source facts. Missing dates are never invented. Relative dates resolve against the user's timezone and current local date. Ambiguous dates are visibly flagged, and materially ambiguous dates require user review before they can affect task creation.

The user's reviewed value becomes the persisted Task date. Original wording and date provenance remain on the Brain Dump item or session record unless the current Task model already supports that metadata.

### API Boundary

Browser and Android/native clients call authenticated TaskLaunch Brain Dump endpoints only. Clients never call OpenAI or another AI provider directly.

Hosted endpoints own:

- auth verification
- ownership checks
- request validation
- provider-neutral Brain Dump AI invocation
- provider response schema validation
- session persistence
- task creation through the existing TaskTimer workspace persistence path
- idempotency and undo orchestration

Provider-specific code stays behind a provider-neutral Brain Dump AI interface. The initial typed extraction prompt identifier is `brain-dump-v1`. Every provider response is strictly validated before any review session data is stored or returned.

Static-export Android/native builds reach the same hosted endpoints through the existing hosted API origin mechanism. They must not rely on local Next.js route handlers that are unavailable in static export runtime.

### Ownership And Session State

Brain Dump sessions are user-owned. Every read, process, edit, confirm, retry, cancel, expiry, cleanup, and undo operation revalidates the authenticated user against the session owner. Another user cannot process, create from, inspect, expire, or undo a session.

Session states:

- `draft`: typed input may be captured and recovered, no provider output committed
- `processing`: hosted processing is active or retryable
- `review`: validated items are available for user review
- `creating`: confirmation has started and batch creation may be in progress
- `completed`: batch result is final, raw source is redacted
- `partially_failed`: some selected items failed and the result identifies retryable items
- `cancelled`: user abandoned the session, raw source is redacted
- `expired`: unfinished session passed retention limits and cannot be revived
- `undone`: a completed batch was safely undone in whole or part

Stale client state must not revive expired, cancelled, completed, or undone sessions.

### Batch Creation And Undo

Every creation request requires an idempotency key scoped to the authenticated user and Brain Dump session. A repeated request with the same key and same payload returns the same stable batch result and creates no duplicate tasks. A changed payload cannot reuse an existing key silently.

Concurrent requests with the same key must converge on one result. If the client disconnects or loses a response, the session and batch record remain recoverable.

Partial failures identify created, failed, and safely retryable items without claiming full success. Retrying must never recreate already successful items.

Successful creation exposes a 30-second safe undo action tied to the stable batch receipt. Undo may remove only tasks that are unstarted, incomplete, unshared, not materially edited, and free of dependent records. Repeated or stale undo requests are idempotent and cannot delete unrelated tasks.

### Source Retention And Redaction

For the typed MVP, raw typed input is retained only in the user-owned Brain Dump session while the session is unfinished or under review. Unfinished sessions expire after 7 days.

Raw typed input is redacted or removed when the session is completed, cancelled, undone, or expired. Task documents, analytics, application logs, error logs, idempotency records, and batch receipts must not store raw Brain Dump content.

The system stores only the minimum source evidence required during review and removes or redacts source evidence after completion unless it is required for an active dispute, recovery flow, or explicit user-facing history feature. Structured extracted item metadata may remain according to the product history policy, but raw source material must not.

Voice and image source files remain future modality inputs. They must be private, user-scoped, excluded from task documents and public URLs, and cleaned up by their later lifecycle rules.

## Public-Interface Behavior Matrix

| Priority | Behavior | Public Interface | Expected Result |
| --- | --- | --- | --- |
| P0 | Confirmation gating | Submit typed input, inspect review, do not confirm | Valid review session exists and no task is created. |
| P0 | Authenticated API boundary | Browser/native client submits Brain Dump input | Client calls TaskLaunch hosted endpoints only; no AI provider is called from the client. |
| P0 | Schema validation | Provider returns malformed or unsupported payload | Response is rejected before storage and no task is created. |
| P0 | Ownership | User B requests User A's session | Request is denied for process, read, edit, confirm, retry, cancel, expiry, and undo operations. |
| P0 | Supported creation | User confirms selected supported items | Tasks are created through the existing TaskTimer workspace persistence path and appear in the normal Tasks experience. |
| P0 | Unsupported visibility | Extraction includes unsupported item types | Unsupported items remain visible, default unselected, and cannot be silently converted. |
| P0 | Date provenance | Extraction includes explicit, suggested, missing, relative, or ambiguous dates | Review preserves `originalDateText`, `dateSource`, timezone, resolved value, and ambiguity state distinctly. |
| P0 | Idempotency | Same creation key and payload is submitted more than once | The same stable batch result is returned and duplicate tasks are not created. |
| P0 | Payload mismatch | Same creation key is submitted with changed payload | Request is rejected and existing batch state is not silently reused. |
| P1 | Recoverability | Processing fails or navigation interrupts review | Draft/review state remains recoverable, retryable when safe, and creates no tasks. |
| P1 | Partial failure | Some selected items fail during creation | Batch result identifies created, failed, and retryable items without recreating successes. |
| P1 | Safe undo | User triggers undo within 30 seconds | Only safe tasks are removed; unsafe tasks remain and are reported. |
| P1 | Retention | Session is completed, cancelled, undone, or expired | Raw input and source evidence are redacted according to retention rules. |
| P1 | Duplicate warning | Proposed item resembles existing workspace task | Warning is advisory; user can skip or create anyway. |
| P2 | Primary entry | User activates the executive function image entry point | Route changes to `/brain-dump` and existing Add Task controls/hooks remain intact. |

## Consequences

Brain Dump implementation issues must add one public-interface test at a time against this contract. Tests should mock only external boundaries such as AI providers, Firebase, Storage, hosted time, and browser media APIs. Owned conversion, validation, idempotency, duplicate scoring, and workspace persistence orchestration should be exercised as real code paths.

This ADR intentionally does not edit generated `architecture.md`. If source structure changes later, update generated docs through `npm run docs:update`.
