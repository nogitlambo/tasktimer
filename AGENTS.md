# AGENTS.md

## Project
- App: Next.js (App Router) TaskTimer app
- Main route: `/tasktimer`
- Additional routes: `/tasktimer/settings`, `/tasktimer/history-manager`, `/tasktimer/user-guide`
- Key files: `src/app/tasktimer/page.tsx`, `src/app/tasktimer/tasktimerClient.ts`, `src/app/tasktimer/lib/*`, `src/app/tasktimer/components/*`

## Current architecture context
- Runtime behavior is primarily wired through `initTaskTimerClient()` in `src/app/tasktimer/tasktimerClient.ts`.
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
- `${STORAGE_KEY}:theme`: `light`/`dark`.
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
- Ensure light-mode overrides are included when introducing new dark-theme visual elements.
- User Guide must not inherit shared `.menu` width caps; keep route-scoped full-width overrides under `#app[aria-label="TaskTimer User Guide"]`.
- User Guide right detail/topic content should use full available panel width.
- User Guide topic list buttons should match Settings module list style (flat treatment; no extra shading unless explicitly requested).
- `tasktimer.css` contains repeated route/media blocks; place final authoritative route-specific overrides in the last applicable route-scoped block to avoid later overrides.
- Prefer route-scoped selectors (`#app[aria-label="..."]`) for Settings/User Guide changes.
- For all newly added modals and pages, always apply current app styling by default:
  - Use existing font tokens/families already used by the app (`var(--font-...)`) rather than introducing new font stacks.
  - Use the current primary background color (`#0d0f13`) and existing panel treatment from `tasktimer.css`.
  - Use existing button design system classes (`btn`, `btn-accent`, `btn-ghost`, `iconBtn`) and existing interaction patterns.
  - Keep visual parity between dark and light theme overrides for any new UI surface.
  - Any newly created modal must use the same visual style and interaction pattern as the Edit Task modal by default.

## Development rules
- Keep behavior changes minimal and scoped to the request.
- Prefer ASCII text in JSX/UI labels unless Unicode is explicitly required.
- Do not introduce mojibake/encoding artifacts; save text files as UTF-8.
- Preserve existing structure and IDs used by `tasktimerClient.ts` DOM wiring.

## Code changes
- For searches, prefer `rg`/`rg --files`.
- Avoid broad refactors unless requested.
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
  - Theme parity regressions: new/changed controls readable and consistent in both dark and light modes.
  - Encoding issues (unexpected replacement characters or mojibake).
  - Lint status via `npm run lint` (warnings are currently present but non-blocking).

## Git hygiene
- Do not revert unrelated local changes.
- Keep diffs focused and easy to review.
- Do not create ad-hoc temp scripts/files in repo root (e.g. `tmp_*`, `__inspect_*`, stray one-off files); use a dedicated temp folder such as `workspace/`.
- Remove accidental scratch artifacts before handoff.

<!-- AUTO-CONTEXT:START -->
## Auto-Generated Context
### Routes (derived from `src/app/tasktimer/**/page.tsx`)
- `/tasktimer`
- `/tasktimer/history-manager`
- `/tasktimer/settings`
- `/tasktimer/user-guide`

### Persistent keys (derived from storage/client modules)
- `ADD_TASK_CUSTOM_KEY = `${STORAGE_KEY}:customTaskNames``
- `CHECKPOINT_ALERT_SOUND_KEY = `${STORAGE_KEY}:checkpointAlertSoundEnabled``
- `CHECKPOINT_ALERT_TOAST_KEY = `${STORAGE_KEY}:checkpointAlertToastEnabled``
- `DASHBOARD_ORDER_KEY = `${STORAGE_KEY}:dashboardOrder``
- `DEFAULT_TASK_TIMER_FORMAT_KEY = `${STORAGE_KEY}:defaultTaskTimerFormat``
- `DYNAMIC_COLORS_KEY = `${STORAGE_KEY}:dynamicColorsEnabled``
- `HISTORY_RANGE_KEY = `${STORAGE_KEY}:historyRangeDaysByTaskId``
- `HISTORY_RANGE_MODE_KEY = `${STORAGE_KEY}:historyRangeModeByTaskId``
- `MODE_LABELS_KEY = `${STORAGE_KEY}:modeLabels``
- `MODE_SETTINGS_KEY = `${STORAGE_KEY}:modeSettings``
- `NAV_STACK_KEY = `${STORAGE_KEY}:navStack``
- `PENDING_TASK_JUMP_KEY = `${STORAGE_KEY}:pendingTaskJump``
- `PINNED_HISTORY_KEY = `${STORAGE_KEY}:pinnedHistoryTaskIds``
- `STORAGE_KEY = "taskticker_tasks_v1"`
- `THEME_KEY = `${STORAGE_KEY}:theme``

### Data hooks (derived from client/components)
- `data-action="closeCheckpointToast"`
- `data-action="collapse"`
- `data-action="delete"`
- `data-action="duplicate"`
- `data-action="edit"`
- `data-action="editName"`
- `data-action="exportTask"`
- `data-action="history"`
- `data-action="jumpToCheckpointTask"`
- `data-action="muteCheckpointAlert"`
- `data-action="reset"`
- `data-action="rmMs"`
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
