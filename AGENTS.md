# AGENTS.md

## Agent skills

### Issue tracker

Issues are tracked in this repo's GitHub Issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The canonical triage labels map directly to this repo's GitHub labels. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain-doc layout rooted at `CONTEXT.md`. See `docs/agents/domain.md`.

## Project
- App: Next.js (App Router) TaskTimer app
- Main route: `/tasklaunch`
- Additional routes: `/dashboard`, `/friends`, `/settings`, `/history-manager`, `/feedback`
- Key files: `src/app/tasklaunch/page.tsx`, `src/app/tasktimer/tasktimerClient.ts`, `src/app/tasktimer/lib/*`, `src/app/tasktimer/components/*`

## Current architecture context
- Repo-level architectural overview lives in `architecture.md`; use it for high-level system boundaries and runtime ownership context.
- Treat `architecture.md` as a secondary reference only: current source files remain the final authority when behavior and documentation differ.
- Runtime behavior is primarily wired through `initTaskTimerClient()` in `src/app/tasktimer/tasktimerClient.ts`.
- The active `/tasklaunch` route now uses the same `initTaskTimerClient()` runtime path as in-app Tasks/Dashboard/Friends navigation; do not assume a separate React-only Tasks mount on direct load.
- Components are modular, but many interactions are ID/class/data-attribute based (`getElementById`, delegated click handlers).
- Preserve IDs and selector hooks in JSX when editing UI.
- Main stylesheet in active use is `src/app/tasktimer/tasktimer.css`.
- Auth behavior is centralized in `src/lib/firebaseClient.ts`; detect native/mobile runtime with `Capacitor.isNativePlatform()` (or `file:`), not `!!window.Capacitor`.

## Tasks model
- TaskTimer now uses a single task list; legacy mode/category behavior is obsolete and should not be reintroduced.

## Settings and overlays
- Settings UI is shared via `src/app/tasktimer/components/SettingsPanel.tsx` and used on `/settings`.
- On `/settings`, auto-select `Account` (`general`) only on desktop/wide layouts where nav + detail panels are shown together.
- On mobile/narrow layouts (list-first view), do not auto-select a pane by default.
- Keep Settings default-pane behavior as initial-render only; do not force-reset pane selection on viewport resize.
- Common overlays and controls depend on stable IDs (e.g. `aboutOverlay`, `howtoOverlay`, `appearanceOverlay`, `confirmOverlay`, `historyAnalysisOverlay`).
- History Manager supports bulk edit, hierarchical checkbox selection, and sortable Date/Time + Elapsed columns.
- Inline history analysis now uses `data-history-action="analyse"` and is enabled only when 2+ columns are lock-selected.
- In Account pane, Delete Account warning text stays always visible.
- Delete Account button remains hidden until disclosure is expanded; expanded button appears below the warning text, centered, with an arrow-only disclosure control.

## Persistent state keys
- `${STORAGE_KEY}`: primary task storage key (via `lib/storage.ts`).
- `${STORAGE_KEY}:theme`: `lime` (legacy app-theme values are normalized on read).
- `${STORAGE_KEY}:customTaskNames`: recent custom Add Task names.
- `${STORAGE_KEY}:pinnedHistoryTaskIds`: pinned inline task history charts.

## Critical UI contracts
- Footer tabs control top-level app page switching; keep IDs stable (`footerDashboardBtn`, `footerTasksBtn`, `footerTest1Btn`, `footerTest2Btn`, `footerSettingsBtn`).
- Add Task controls should only be visible on the Tasks page.
- Inline task history is wired via `data-history-action` handlers and includes actions like `manage`, `close`, and `pin`.
- History Manager back action is expected to return to `/settings`.
- Settings exit button `#closeMenuBtn` label is `Close` and exits to dashboard fallback (`/tasklaunch?page=dashboard`) when no overlay/nav stack is active.
- Settings mobile detail `Back` is pane navigation only (returns to module list), not route exit.
- `/privacy` back behavior must be history-aware: use browser back when history exists, else fallback to `/settings`.
- Authenticated routes are auth-protected via route-specific layouts; unauthenticated users must be redirected to `/`.
- Landing page auth UX does not include guest entry or authenticated shortcut buttons (`Guest Sign In`, `Go to Dashboard`, `Go to Tasks`).
- Logout must clear local workspace cache and land on `/login`.
- Preserve selector hooks used by delegated handlers (`data-action`, `data-history-action`, `data-menu`, `data-move-mode`).

## Styling guardrails
- Main active stylesheet is `src/app/tasktimer/tasktimer.css`.
- `src/app/tasktimer/styles/*` is the owned editing surface for TaskTimer UI rules.
- `src/app/tasktimer/tasktimer.css` is an import-only bundle entrypoint; do not add route/component rules there.
- Prefer the owner split file for new edits:
  - dashboard: `03-dashboard.css` and `10-responsive.css`
  - overlays/modals: `04-overlays.css`
  - settings/account/about/rank ladder: `06-settings.css`
  - desktop rail: `09-desktop-rail.css` and `10-responsive.css`
- Keep new visual elements aligned to the primary `lime` theme path.
- New toggle switches should reuse the app's existing `.switch` visual system by default; avoid one-off borders, accent outlines, or custom switch chrome unless explicitly requested.
- New toggle switches should match the shared app dimensions by default: `39x21` switch track, `18x18` thumb, and `left:19px` for the on-state thumb position.
- Do not add new catch-all override blocks to `tasktimer.css`; keep ownership local to the split file that owns the component/route.
- Prefer route-scoped selectors (`#app[aria-label="..."]`) for Settings changes.
- For all newly added non-excluded modals and pages, always apply current app styling by default:
  - Use existing font tokens/families already used by the app (`var(--font-...)`) rather than introducing new font stacks.
  - Use the current primary background color (`#0d0f13`) and existing panel treatment from `tasktimer.css`.
  - Use existing button design system classes (`btn`, `btn-accent`, `btn-ghost`, `iconBtn`) and existing interaction patterns.
  - Any newly created standard modal must use the temporary Modal preview (`#temporaryModalOverlay`) as the visual baseline by default.

## Modal Contract (Required)
- Required pattern: new standard modals must match the structure and class usage used by the temporary Modal preview in `src/app/tasktimer/components/DesktopAppRail.tsx`.
- Visual reference: match `#temporaryModalOverlay` (square panel chrome, square modal buttons, compact heading, grey modal subtext, grey Orbitron modal action buttons, standard dropdown/select styling, primary-theme hover/focus accents).
- Total exemptions: Add Task (`#addTaskOverlay`), Edit Task (`#editOverlay`), Friend Info (`#friendProfileModal`), User Summary (`#leaderboardPositionOverlay`), and Session Summary (`#historyEntryNoteOverlay`) intentionally use different styling rules and must not be conformed to the standard modal baseline unless explicitly requested.
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
  - Use `Ligconsolata`, `Inconsolata`, then `var(--font-geist-mono)` at `13px` for standard modal `.modalSubtext` and confirm explanatory text such as `.confirmText`; do not apply this rule to labels, inputs, selects, or buttons unless a modal has a local rule.
  - Use the Modal preview action-button treatment for standard modal action rows: grey border/background, Orbitron text at `11px`, and primary-theme border/text color on hover/focus. Preserve `btn-warn` destructive styling unless the user explicitly requests otherwise.
  - For standard modal dropdowns/selects, use square select chrome with `#1a1b20` as the border accent; helper text should use `.modalDropdownHelp` with `Ligconsolata`, `Inconsolata`, then `var(--font-geist-mono)` at `13px` in grey.
  - Use explicit allowlists for standard modal CSS rules; avoid broad `.overlay .modal` catch-all styling that would affect exempt modals.
  - Avoid inline styles except transient visibility/state toggles (for example `display: none`).
- Required interaction behavior:
  - Preserve existing close/cancel behavior patterns used by current overlays.
  - Preserve ID/data-attribute hooks consumed by `tasktimerClient.ts` delegated handlers.
- Compliance checklist for any PR that adds/modifies a modal:
  - Modal uses required overlay/modal/button classes above.
  - Modal is visually consistent with the primary theme.
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
- For UI images, prefer `src/components/AppImg.tsx` by default. TaskTimer has several CSS- and ID-driven image hooks, so `AppImg` preserves native `img` behavior while keeping lint clean.
- Only use raw `<img>` when there is a deliberate reason, and include a local lint suppression with a short justification at that exact site.

## Validation
- After edits, check for:
  - Type/build syntax issues in touched files.
  - ID/className regressions that can break client-side bindings.
- `data-*` action hook regressions (`data-action`, `data-history-action`, `data-menu`, `data-move-mode`).
- CSS ownership regressions via `npm run css:audit:tasktimer`.
  - Page/route navigation regressions between `/tasklaunch`, `/dashboard`, `/friends`, `/settings`, `/history-manager`, `/feedback`.
  - History Manager behavior regressions: bulk selection propagation (task -> date -> rows), sortable columns, and delete summary accuracy.
  - Pinned history behavior: pinned chart reopens on Tasks page and persists via `${STORAGE_KEY}:pinnedHistoryTaskIds`.
  - Primary theme regressions: new/changed controls readable and consistent.
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
### Routes (derived from authenticated app page files)
- `/dashboard`
- `/feedback`
- `/friends`
- `/history-manager`
- `/settings`
- `/tasklaunch`

### Persistent keys (derived from storage/client modules)
- `ACHIEVEMENT_SOUNDS_KEY = `${storageKey}:achievementSoundsEnabled``
- `AUTO_FOCUS_ON_TASK_LAUNCH_KEY = `${storageKey}:autoFocusOnTaskLaunchEnabled``
- `CHECKPOINT_ALERT_SOUND_KEY = `${storageKey}:checkpointAlertSoundEnabled``
- `CHECKPOINT_ALERT_TOAST_KEY = `${storageKey}:checkpointAlertToastEnabled``
- `DYNAMIC_COLORS_KEY = `${storageKey}:dynamicColorsEnabled``
- `FOCUS_SESSION_NOTES_KEY = `${storageKey}:focusSessionNotes``
- `INTERACTION_CLICK_SOUND_KEY = `${storageKey}:interactionClickSoundEnabled``
- `INTERACTION_HAPTICS_INTENSITY_KEY = `${storageKey}:interactionHapticsIntensity``
- `INTERACTION_HAPTICS_KEY = `${storageKey}:interactionHapticsEnabled``
- `MENU_BUTTON_STYLE_KEY = `${storageKey}:menuButtonStyle``
- `MOBILE_PUSH_ALERTS_KEY = `${storageKey}:mobilePushAlertsEnabled``
- `NAV_STACK_KEY = `${storageKey}:navStack``
- `OPTIMAL_PRODUCTIVITY_DAYS_KEY = `${storageKey}:optimalProductivityDays``
- `OPTIMAL_PRODUCTIVITY_END_TIME_KEY = `${storageKey}:optimalProductivityEndTime``
- `OPTIMAL_PRODUCTIVITY_START_TIME_KEY = `${storageKey}:optimalProductivityStartTime``
- `STARTUP_MODULE_KEY = `${storageKey}:startupModule``
- `STORAGE_KEY = "taskticker_tasks_v1"`
- `TASK_ORDER_BY_KEY = `${storageKey}:taskOrderBy``
- `TASK_VIEW_KEY = `${storageKey}:taskView``
- `THEME_KEY = `${storageKey}:theme``
- `WEB_PUSH_ALERTS_KEY = `${storageKey}:webPushAlertsEnabled``
- `WEEK_STARTING_KEY = `${storageKey}:weekStarting``

### Data hooks (derived from client/components)
- `data-action="archive"`
- `data-action="closeCheckpointToast"`
- `data-action="copyCloudSyncLogId"`
- `data-action="delete"`
- `data-action="dismissCloudSyncNotice"`
- `data-action="edit"`
- `data-action="editName"`
- `data-action="exportTask"`
- `data-action="focus"`
- `data-action="history"`
- `data-action="jumpToCheckpointTask"`
- `data-action="manualEntry"`
- `data-action="muteCheckpointAlert"`
- `data-action="openAddTask"`
- `data-action="reset"`
- `data-action="rmMs"`
- `data-action="shareTask"`
- `data-action="start"`
- `data-action="stop"`
- `data-action="toggleMsAlert"`
- `data-action="unshareTask"`
- `data-history-action="analyse"`
- `data-history-action="clearLocks"`
- `data-history-action="delete"`
- `data-history-action="manage"`
- `data-history-action="newer"`
- `data-history-action="older"`
- `data-history-action="pin"`
- `data-history-action="viewSummary"`
- `data-menu="historyManager"`
<!-- AUTO-CONTEXT:END -->
