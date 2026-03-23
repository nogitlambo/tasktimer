# AGENTS.md

## Project
- App: Next.js (App Router) TaskTimer app
- Main route: `/tasktimer`
- Additional routes: `/tasktimer/settings`, `/tasktimer/history-manager`, `/tasktimer/user-guide`
- Key files: `src/app/tasktimer/page.tsx`, `src/app/tasktimer/tasktimerClient.ts`, `src/app/tasktimer/lib/*`, `src/app/tasktimer/components/*`

## Current architecture context
- Repo-level architectural overview lives in `architecture.md`; use it for high-level system boundaries, runtime ownership, and onboarding context.
- Treat `architecture.md` as a secondary reference only: current source files remain the final authority when behavior and documentation differ.
- Runtime behavior is primarily wired through `initTaskTimerClient()` in `src/app/tasktimer/tasktimerClient.ts`.
- The active `/tasktimer` route now uses the same `initTaskTimerClient()` runtime path as in-app Tasks/Dashboard/Friends navigation; do not assume a separate React-only Tasks mount on direct load.
- Components are modular, but many interactions are ID/class/data-attribute based (`getElementById`, delegated click handlers).
- Preserve IDs and selector hooks in JSX when editing UI.
- Main stylesheet in active use is `src/app/tasktimer/tasktimer.css`.
- `src/app/tasktimer/styles/tasktimer.css` also exists; avoid unintended dual edits.
- Auth behavior is centralized in `src/lib/firebaseClient.ts`; detect native/mobile runtime with `Capacitor.isNativePlatform()` (or `file:`), not `!!window.Capacitor`.

## Modes and categories
- Task categories are implemented as three internal modes: `mode1`, `mode2`, `mode3`.
- Default/reset mode labels are `Mode 1`, `Mode 2`, `Mode 3` (UI may display `Default Mode` for mode1 in Configure Modes).
- Mode/category settings persist via localStorage key `${STORAGE_KEY}:modeSettings`.
- Legacy fallback key `${STORAGE_KEY}:modeLabels` is still read for backward compatibility.
- Mode 1 is always enabled; Mode 2 and Mode 3 can be enabled/disabled in Category Manager.

## Settings and overlays
- Settings UI is shared via `src/app/tasktimer/components/SettingsPanel.tsx` and used on `/tasktimer/settings`.
- On `/tasktimer/settings`, auto-select `Account` (`general`) only on desktop/wide layouts where nav + detail panels are shown together.
- On mobile/narrow layouts (list-first view), do not auto-select a pane by default.
- Keep Settings default-pane behavior as initial-render only; do not force-reset pane selection on viewport resize.
- Category Manager is implemented as an overlay in `src/app/tasktimer/components/InfoOverlays.tsx` and opened via `data-menu="categoryManager"`.
- Common overlays and controls depend on stable IDs (e.g. `aboutOverlay`, `howtoOverlay`, `appearanceOverlay`, `categoryManagerOverlay`, `confirmOverlay`, `historyAnalysisOverlay`).
- History Manager supports bulk edit, hierarchical checkbox selection, and sortable Date/Time + Elapsed columns.
- Inline history analysis now uses `data-history-action="analyse"` and is enabled only when 2+ columns are lock-selected.
- In Account pane, Delete Account warning text stays always visible.
- Delete Account button remains hidden until disclosure is expanded; expanded button appears below the warning text, centered, with an arrow-only disclosure control.

## Persistent state keys
- `${STORAGE_KEY}`: primary task storage key (via `lib/storage.ts`).
- `${STORAGE_KEY}:modeSettings`: mode labels/enabled states/colors.
- `${STORAGE_KEY}:modeLabels`: legacy mode label fallback.
- `${STORAGE_KEY}:theme`: `purple`/`cyan` (legacy values may still be normalized on read).
- `${STORAGE_KEY}:customTaskNames`: recent custom Add Task names.
- `${STORAGE_KEY}:pinnedHistoryTaskIds`: pinned inline task history charts.

## Critical UI contracts
- Footer tabs control top-level app page switching; keep IDs stable (`footerDashboardBtn`, `footerTasksBtn`, `footerTest1Btn`, `footerTest2Btn`, `footerSettingsBtn`).
- Mode switch and Add Task controls should only be visible on the Tasks page.
- Inline task history is wired via `data-history-action` handlers and includes actions like `manage`, `close`, and `pin`.
- History Manager back action is expected to return to `/tasktimer/settings`.
- Settings exit button `#closeMenuBtn` label is `Close` and exits to dashboard fallback (`/tasktimer?page=dashboard`) when no overlay/nav stack is active.
- Settings mobile detail `Back` is pane navigation only (returns to module list), not route exit.
- `/privacy` back behavior must be history-aware: use browser back when history exists, else fallback to `/tasktimer/settings`.
- All `/tasktimer/*` routes are auth-protected via `src/app/tasktimer/layout.tsx`; unauthenticated users must be redirected to `/`.
- Landing page auth UX does not include guest entry or authenticated shortcut buttons (`Guest Sign In`, `Go to Dashboard`, `Go to Tasks`).
- Logout must land on `/` and preserve the one-time signed-out handoff (`?signedOut=1` + `tasktimer:authSignedOutRedirectBypass`) to avoid immediate auth redirect races.
- Preserve selector hooks used by delegated handlers (`data-action`, `data-history-action`, `data-menu`, `data-move-mode`).

## Styling guardrails
- Main active stylesheet is `src/app/tasktimer/tasktimer.css`; avoid unintended edits to `src/app/tasktimer/styles/tasktimer.css`.
- Preserve the current slanted/parallelogram control language unless the request explicitly asks to change it.
- Ensure purple/cyan theme parity when introducing new visual elements.
- New toggle switches should reuse the app's existing `.switch` visual system and `body[data-control-style]` behavior by default; avoid one-off borders, accent outlines, or custom switch chrome unless explicitly requested.
- New toggle switches should match the shared app dimensions by default: `39x21` switch track, `18x18` thumb, and `left:19px` for the on-state thumb position.
- User Guide must not inherit shared `.menu` width caps; keep route-scoped full-width overrides under `#app[aria-label="TaskTimer User Guide"]`.
- User Guide right detail/topic content should use full available panel width.
- User Guide topic list buttons should match Settings module list style (flat treatment; no extra shading unless explicitly requested).
- `tasktimer.css` contains repeated route/media blocks; place final authoritative route-specific overrides in the last applicable route-scoped block to avoid later overrides.
- Prefer route-scoped selectors (`#app[aria-label="..."]`) for Settings/User Guide changes.
- For all newly added modals and pages, always apply current app styling by default:
  - Use existing font tokens/families already used by the app (`var(--font-...)`) rather than introducing new font stacks.
  - Use the current primary background color (`#0d0f13`) and existing panel treatment from `tasktimer.css`.
  - Use existing button design system classes (`btn`, `btn-accent`, `btn-ghost`, `iconBtn`) and existing interaction patterns.
  - Keep visual parity between purple and cyan theme overrides for any new UI surface.
  - Any newly created modal must use the same visual style and interaction pattern as the Edit Task modal by default.

## Modal Contract (Required)
- Canonical pattern: new modals must match the structure and class usage used by `src/app/tasktimer/components/ConfirmOverlay.tsx` and existing edit-style overlays.
- Visual reference: match the Add Task modal style (glass panel, subtle border, compact heading/subheading, outlined secondary action, cyan primary action).
- Required structure:
  - Overlay container: `<div className="overlay" id="...Overlay">`
  - Modal container: `<div className="modal" role="dialog" aria-modal="true" aria-label="...">`
  - Body content uses existing modal utility classes already in `tasktimer.css` (for example `confirmText`, `modalSubtext`, `chkRow`, `confirmBtns`) instead of new one-off class systems.
- Required control classes:
  - Primary actions: `btn btn-accent`
  - Secondary actions: `btn btn-ghost`
  - Destructive actions: `btn btn-warn`
  - Icon-only actions: `iconBtn`
- Required styling behavior:
  - Do not introduce new font stacks in modal code.
  - Do not introduce standalone modal color palettes; use existing tokens/colors from `tasktimer.css`.
  - Purple/cyan theme parity is mandatory for any new modal-specific class added to `tasktimer.css`.
  - Avoid inline styles except transient visibility/state toggles (for example `display: none`).
- Required interaction behavior:
  - Preserve existing close/cancel behavior patterns used by current overlays.
  - Preserve ID/data-attribute hooks consumed by `tasktimerClient.ts` delegated handlers.
- Compliance checklist for any PR that adds/modifies a modal:
  - Modal uses required overlay/modal/button classes above.
  - Modal is visually consistent in both purple and cyan themes.
  - No custom font stack or one-off modal palette introduced.
  - No delegated event hook regressions (`id`, `data-action`, `data-menu`, `data-history-action`, `data-move-mode` as applicable).

## Development rules
- Keep behavior changes minimal and scoped to the request.
- Prefer ASCII text in JSX/UI labels unless Unicode is explicitly required.
- Do not introduce mojibake/encoding artifacts; save text files as UTF-8.
- Preserve existing structure and IDs used by `tasktimerClient.ts` DOM wiring.

## Code changes
- For searches, prefer `rg`/`rg --files`.
- Avoid broad refactors unless requested.
- For cross-cutting changes, migrations, or architecture questions, review `architecture.md` before editing.
- If editing UI labels in JSX, avoid raw `<` or `>` characters in text nodes.
- Keep TypeScript/React code compatible with Next.js 16 App Router conventions.
- For route generation in Next.js dev/web, do not force `/index.html` URLs; only use exported `index.html` pathing for true file/native export runtime.

## Validation
- After edits, check for:
  - Type/build syntax issues in touched files.
  - ID/className regressions that can break client-side bindings.
  - `data-*` action hook regressions (`data-action`, `data-history-action`, `data-menu`, `data-move-mode`).
  - Page/route navigation regressions between `/tasktimer`, `/tasktimer/settings`, `/tasktimer/history-manager`, `/tasktimer/user-guide`.
  - History Manager behavior regressions: bulk selection propagation (task -> date -> rows), sortable columns, and delete summary accuracy.
  - Pinned history behavior: pinned chart reopens on Tasks page and persists via `${STORAGE_KEY}:pinnedHistoryTaskIds`.
  - Theme parity regressions: new/changed controls readable and consistent in both purple and cyan themes.
  - Encoding issues (unexpected replacement characters or mojibake).
  - Lint status via `npm run lint` (warnings are currently present but non-blocking).

## Git hygiene
- Do not revert unrelated local changes.
- Keep diffs focused and easy to review.
- Do not create ad-hoc temp scripts/files in repo root (e.g. `tmp_*`, any `__*` scratch/inspection file, stray zero-byte one-off files like `Delete`/`Friends`/`Tasks`, or malformed accidental shell-output artifacts); use a dedicated temp folder such as `workspace/`.
- Root scratch artifacts are hygiene regressions even when they are not referenced by the codebase; repo root should contain only intentional source, config, documentation, or generated project files.
- Before handoff, scan repo root for accidental scratch artifacts and remove them without touching legitimate project files such as `package.json`, `README.md`, `AGENTS.md`, `architecture.md`, `next.config.ts`, `tsconfig.json`, `firebase.json`, or `capacitor.config.ts`.

<!-- AUTO-CONTEXT:START -->
## Auto-Generated Context
### Routes (derived from `src/app/tasktimer/**/page.tsx`)
- `/tasktimer`
- `/tasktimer/dashboard`
- `/tasktimer/feedback`
- `/tasktimer/friends`
- `/tasktimer/history-manager`
- `/tasktimer/settings`
- `/tasktimer/user-guide`

### Persistent keys (derived from storage/client modules)
- `AUTO_FOCUS_ON_TASK_LAUNCH_KEY = `${storageKey}:autoFocusOnTaskLaunchEnabled``
- `CHECKPOINT_ALERT_SOUND_KEY = `${storageKey}:checkpointAlertSoundEnabled``
- `CHECKPOINT_ALERT_TOAST_KEY = `${storageKey}:checkpointAlertToastEnabled``
- `DEFAULT_TASK_TIMER_FORMAT_KEY = `${storageKey}:defaultTaskTimerFormat``
- `DYNAMIC_COLORS_KEY = `${storageKey}:dynamicColorsEnabled``
- `FOCUS_SESSION_NOTES_KEY = `${storageKey}:focusSessionNotes``
- `MENU_BUTTON_STYLE_KEY = `${storageKey}:menuButtonStyle``
- `MODE_SETTINGS_KEY = `${storageKey}:modeSettings``
- `NAV_STACK_KEY = `${storageKey}:navStack``
- `PENDING_PUSH_TASK_ID_KEY = `${STORAGE_KEY}:pendingPushTaskId``
- `STORAGE_KEY = "taskticker_tasks_v1"`
- `TASK_VIEW_KEY = `${storageKey}:taskView``
- `THEME_KEY = `${storageKey}:theme``
- `TIME_GOAL_PENDING_FLOW_KEY = `${STORAGE_KEY}:timeGoalPendingFlow``

### Data hooks (derived from client/components)
- `data-action="closeCheckpointToast"`
- `data-action="collapse"`
- `data-action="delete"`
- `data-action="duplicate"`
- `data-action="edit"`
- `data-action="editName"`
- `data-action="exportTask"`
- `data-action="focus"`
- `data-action="history"`
- `data-action="jumpToCheckpointTask"`
- `data-action="muteCheckpointAlert"`
- `data-action="reset"`
- `data-action="rmMs"`
- `data-action="showSuppressedCheckpointAlert"`
- `data-action="start"`
- `data-action="stop"`
- `data-history-action="analyse"`
- `data-history-action="clearLocks"`
- `data-history-action="delete"`
- `data-history-action="export"`
- `data-history-action="manage"`
- `data-history-action="newer"`
- `data-history-action="older"`
- `data-history-action="pin"`
- `data-menu="historyManager"`
- `data-menu="howto"`
- `data-move-mode="mode1"`
- `data-move-mode="mode2"`
- `data-move-mode="mode3"`
<!-- AUTO-CONTEXT:END -->
