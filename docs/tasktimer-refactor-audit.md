# TaskTimer Refactor Audit

This document captures the compatibility guardrails and the first-pass hotspot audit for the TaskTimer runtime while the staged refactor is in progress.

## Compatibility Rules

- Preserve existing route behavior for `/tasklaunch`, `/dashboard`, `/friends`, `/settings`, `/history-manager`, `/user-guide`, and `/feedback`.
- Preserve delegated selector hooks used by the runtime:
  `id`, `data-action`, `data-history-action`, `data-menu`, and `data-move-mode`.
- Preserve storage keys rooted at `taskticker_tasks_v1` unless a future migration explicitly versions them.
- Preserve modal structure and button classes described in `AGENTS.md`.

## Current Hotspots

Snapshot from the April 5, 2026 repository state:

- Largest frontend runtime file: `src/app/tasktimer/tasktimerClient.ts` at about 2643 lines.
- Largest React UI file: `src/app/tasktimer/components/SettingsPanel.tsx` at about 1787 lines.
- Largest dashboard renderer: `src/app/tasktimer/client/dashboard-render.ts` at about 1746 lines.
- Largest CSS hotspots:
  - `src/app/tasktimer/styles/03-dashboard.css` at about 4405 lines
  - `src/app/tasktimer/styles/06-settings.css` at about 3369 lines
  - `src/app/tasktimer/styles/10-responsive.css` at about 3198 lines

High-frequency coupling signals:

- `localStorage` usage is concentrated in:
  - `src/app/tasktimer/lib/storage.ts`
  - `src/app/tasktimer/client/preferences.ts`
  - `src/app/tasktimer/client/session.ts`
  - `src/app/tasktimer/components/SettingsPanel.tsx`
  - `src/app/tasktimer/components/DesktopAppRail.tsx`
- `innerHTML` usage is concentrated in:
  - `src/app/tasktimer/client/dashboard-render.ts`
  - `src/app/tasktimer/client/session.ts`
  - `src/app/tasktimer/client/groups.ts`
  - `src/app/tasktimer/client/add-task.ts`
  - `src/app/tasktimer/client/history-inline.ts`
- Overlay and menu wiring is concentrated in:
  - `src/app/tasktimer/client/popup-menu.ts`
  - `src/app/tasktimer/client/confirm-overlay.ts`
  - `src/app/tasktimer/components/InfoOverlays.tsx`
  - `src/app/tasktimer/components/SettingsPanel.tsx`

## Refactor Seams Added In This Pass

- `TaskTimerWorkspaceRepository`
  Central wrapper around workspace persistence primitives.
- `TaskTimerPreferencesService`
  Shared logic for preference reads, writes, and cloud snapshot persistence.
- `TaskTimerAccountProfileStorage`
  Shared local-storage helpers for avatar and rank thumbnail state.
- `DashboardViewModelBuilder`
  Pure dashboard summary and render-signature computation for instrumentation and selective rendering.
- `DashboardPerformanceTracker`
  Non-invasive performance instrumentation for full and live dashboard rendering.
- `OverlayRegistry` and `OverlayController`
  Shared mapping layer for informational overlays and menu-triggered navigation.

## Validation Focus

After each refactor slice, verify:

- task rendering, add/edit/delete, and inline history behavior on `/tasklaunch`
- dashboard widget rendering, refresh, edit mode, panel menu, and live updates on `/dashboard`
- settings desktop/mobile pane behavior on `/settings`
- overlay open and close behavior, including back-navigation interactions
- persistence continuity across local boot, cloud hydration, and pending sync replay
