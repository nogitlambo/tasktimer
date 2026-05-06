# Context

## TaskTimer

- TaskTimer workspace persistence module: the module that owns TaskTimer workspace hydration, cached task/history/live-session reads, task/history writes, cloud collection subscriptions, pending sync status, and preferences/dashboard/task-UI cache adapters.
- TaskTimer runtime composition: the module that creates runtime stores, derived storage keys, runtime adapters, and long-lived mutable references before feature modules are wired.
- Workspace domain adapters: focused runtime-composition adapters that expose persistence capabilities by domain (for example history snapshots or preference persistence) instead of passing broad repository objects into feature modules.
- Task card action effects: the module that owns task-card `data-action` side-effect routing, entitlement gates, deferred manual-entry opening, unshare confirmation, and checkpoint mute behavior.
- Task card rendering contract: the module that owns Task card HTML, stable `data-action` hooks, feature-gated menu labels, and action dispatch gating for the Tasks page.
- Task destructive action effects: the module that owns reset-one and reset-all confirmation flow, history clearing, deleted-task metadata clearing, shared-summary cleanup scheduling, and post-delete render/summary messaging.
- Inline history selection interaction: the module that owns inline history selected and locked entry state, delete and summary target derivation, analysis eligibility, and selection updates after deleted entries.
- Dashboard card render module: a focused card-level module that owns a dashboard card's view-model calculations and DOM output contract while preserving existing card IDs, selector hooks, entitlement behavior, and accessibility labels.
- Focus session drafts: the module that owns focus-note draft load, set, clear, persist, pending-save flush, live capture, and reset/stop snapshot behavior for task timer lifecycle and Session UI.
- Task list render orchestration: the module that owns visible task ordering, Tasks page list/tile DOM construction, open and pinned inline-history cleanup, and post-render history scheduling.
- Task manual entry interaction: the module that owns the Tasks page manual history-entry overlay draft state, input syncing, validation display, difficulty selection state, and picker focus behavior.
- Task timer lifecycle: the module that owns start, stop, and immediate reset orchestration for task timers, including live-session/reward adapters, focus-note flushing, checkpoint cleanup, shared-summary sync scheduling, and dashboard refresh triggers.
