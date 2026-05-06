# TaskTimer Refactor Notes

## TaskTimer Workspace Persistence Module

**Files:** `workspaceRepository.ts` line 37, `storage.ts`, `persistence.ts` line 14

### Problem

`workspaceRepository` is currently a thin adapter over `storage.ts`. Its interface exposes many low-level reads/writes, so callers still need to know hydration ordering, cache fallback rules, history cleanup, deleted metadata, preferences, dashboard cache, and task UI cache details.

### Solution

Deepen the TaskTimer workspace persistence module around higher-level workspace operations:

- Hydrate workspace snapshot
- Persist task mutation
- Persist history mutation
- Persist preferences/task UI/dashboard
- Subscribe to workspace changes

### Benefits

Better locality for storage/cloud/cache rules. Tests could exercise workspace-level behavior through one interface instead of rebuilding storage sequencing across feature tests.

---

## TaskTimer Runtime Composition

**Files:** `runtime-composition.ts` line 15, `tasktimerClient.ts` line 125, `feature-context-builders.ts` line 29

### Problem

`runtime-composition` has depth for creating stores and keys, but `tasktimerClient.ts` still owns a large amount of composition knowledge. `feature-context-builders.ts` then repeats that knowledge as very wide option objects.

### Solution

Move from “bag of stores plus many builder args” toward a smaller runtime composition interface that exposes named domain modules:

- Task data
- Preferences
- History UI
- Dashboard UI
- Groups
- Session
- Overlays

### Benefits

More leverage from composition: feature modules would depend on fewer facts. Locality improves because adding one runtime concern would affect the composition module instead of many builder type surfaces.

---

## Task List Render Orchestration

**Files:** `tasks.ts` line 13, `task-list-renderer.ts` line 82, `task-card-view-model.ts` line 1

### Problem

Rendering is split well, but `task-list-renderer` still has a broad interface: ordering, tile layout, pinned history cleanup, flip state, history rendering, dashboard refresh, time-goal restoration, entitlement state, dynamic colors, elapsed formatting. That makes the renderer shallow relative to what callers must know.

### Solution

Deepen the Task list render orchestration module so callers say “render Tasks page” with a task list view state, while internal adapters own ordering, pinned-history reconciliation, post-render scheduling, and card rendering inputs.

### Benefits

Better locality for Tasks page rendering bugs. Tests can verify visible task ordering, pinned history reopening, and empty-state behavior through the render orchestration interface instead of stubbing many unrelated callbacks.

---

## Task Timer Lifecycle

**Files:** `task-timer-lifecycle.ts` line 51, `tasks.ts` line 128, `persistence.ts` line 194

### Problem

The lifecycle module owns start/stop/reset logic, but its interface exposes many implementation details: reward segments, live sessions, checkpoint baselines, focus notes, dashboard refresh, shared summary sync, and time-goal flow cleanup.

### Solution

Deepen Task timer lifecycle around task commands:

- Launch task
- Stop task
- Reset task state

Put the reward/live-session/checkpoint/focus/shared-summary coordination behind that interface.

### Benefits

Strong locality for timer correctness. The interface becomes the test surface for “starting one task stops/confirms another,” “stop finalizes live session,” and “reset clears related runtime state.”

---

## Task Manual Entry Interaction

**Files:** `tasks.ts` line 39, `task-manual-entry-interaction.ts` line 25, `history-manager-shared.ts`

### Problem

Manual entry UI draft state is nicely isolated, but saving is outside the module in `tasks.ts`. That means the caller must know how to parse the draft, append history, save history, sync shared summaries, close, and render.

### Solution

Deepen Task manual entry interaction so it owns the full “open/edit/save/cancel manual entry” flow, with injected history persistence and shared-summary adapters.

### Benefits

Better locality for validation and save behavior. Tests could cover the whole manual entry flow through one interface rather than testing draft UI separately from history mutation.

---

## Second-Pass Architecture Vocabulary Review

The second-pass slices kept the existing user experience and selectors while making several seams durable enough for future agents to reuse:

- **Workspace history snapshots** are now part of the workspace persistence interface. Callers should ask the workspace module for cleanup-aware history snapshots instead of rebuilding cleanup/signature checks locally.
- **Workspace domain adapters** are the preferred runtime-composition shape when a feature needs a narrow persistence capability. Avoid creating hidden repository instances inside feature modules.
- **Focus session drafts** are the single owner for focus-note draft load, set, clear, persist, pending-save flush, live capture, and reset snapshot behavior. Timer lifecycle and Session UI should route through that interface rather than duplicating localStorage/timer rules.
- **Dashboard card render modules** are suitable for cards with meaningful calculations or DOM contracts. The pattern is useful for Momentum and Tasks Completed, and can be applied incrementally to other high-risk cards without a broad dashboard rewrite.

Rejected seam for now: a catch-all dashboard renderer facade. It would hide too much ID-driven DOM behavior behind a new broad abstraction and risks becoming another pass-through layer. Prefer card-level modules with focused tests.
