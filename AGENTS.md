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

## Modes and categories
- Task categories are implemented as three internal modes: `mode1`, `mode2`, `mode3`.
- Default/reset mode labels are `Mode 1`, `Mode 2`, `Mode 3` (UI may display `Default Mode` for mode1 in Configure Modes).
- Mode/category settings persist via localStorage key `${STORAGE_KEY}:modeSettings`.
- Legacy fallback key `${STORAGE_KEY}:modeLabels` is still read for backward compatibility.
- Mode 1 is always enabled; Mode 2 and Mode 3 can be enabled/disabled in Category Manager.

## Settings and overlays
- Settings UI is shared via `src/app/tasktimer/components/SettingsPanel.tsx` and used on `/tasktimer/settings`.
- Category Manager is implemented as an overlay in `src/app/tasktimer/components/InfoOverlays.tsx` and opened via `data-menu="categoryManager"`.
- Common overlays and controls depend on stable IDs (e.g. `aboutOverlay`, `howtoOverlay`, `appearanceOverlay`, `categoryManagerOverlay`, `confirmOverlay`).
- History Manager supports bulk edit, hierarchical checkbox selection, and sortable Date/Time + Elapsed columns.

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
- Preserve selector hooks used by delegated handlers (`data-action`, `data-history-action`, `data-menu`, `data-move-mode`).

## Styling guardrails
- Main active stylesheet is `src/app/tasktimer/tasktimer.css`; avoid unintended edits to `src/app/tasktimer/styles/tasktimer.css`.
- Preserve the current slanted/parallelogram control language unless the request explicitly asks to change it.
- Ensure light-mode overrides are included when introducing new dark-theme visual elements.

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

<!-- AUTO-CONTEXT:START -->
## Auto-Generated Context
### Routes (derived from `src/app/tasktimer/**/page.tsx`)
- `/tasktimer`
- `/tasktimer/history-manager`
- `/tasktimer/settings`
- `/tasktimer/user-guide`

### Persistent keys (derived from storage/client modules)
- `ADD_TASK_CUSTOM_KEY = `${STORAGE_KEY}:customTaskNames``
- `DEFAULT_TASK_TIMER_FORMAT_KEY = `${STORAGE_KEY}:defaultTaskTimerFormat``
- `MODE_LABELS_KEY = `${STORAGE_KEY}:modeLabels``
- `MODE_SETTINGS_KEY = `${STORAGE_KEY}:modeSettings``
- `PINNED_HISTORY_KEY = `${STORAGE_KEY}:pinnedHistoryTaskIds``
- `STORAGE_KEY = "taskticker_tasks_v1"`
- `THEME_KEY = `${STORAGE_KEY}:theme``

### Data hooks (derived from client/components)
- `data-action="collapse"`
- `data-action="delete"`
- `data-action="duplicate"`
- `data-action="edit"`
- `data-action="editName"`
- `data-action="history"`
- `data-action="reset"`
- `data-action="rmMs"`
- `data-action="start"`
- `data-action="stop"`
- `data-history-action="analyse"`
- `data-history-action="close"`
- `data-history-action="delete"`
- `data-history-action="export"`
- `data-history-action="manage"`
- `data-history-action="newer"`
- `data-history-action="older"`
- `data-history-action="pin"`
- `data-menu="about"`
- `data-menu="appearance"`
- `data-menu="categoryManager"`
- `data-menu="contact"`
- `data-menu="historyManager"`
- `data-menu="howto"`
- `data-menu="taskSettings"`
- `data-move-mode="mode1"`
- `data-move-mode="mode2"`
- `data-move-mode="mode3"`
<!-- AUTO-CONTEXT:END -->
