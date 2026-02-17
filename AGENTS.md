# AGENTS.md

## Project
- App: Next.js (App Router) TaskTimer app
- Main route: `/tasktimer`
- Additional routes: `/tasktimer/settings`, `/tasktimer/history-manager`
- Key files: `src/app/tasktimer/page.tsx`, `src/app/tasktimer/tasktimerClient.ts`, `src/app/tasktimer/lib/*`, `src/app/tasktimer/components/*`

## Current architecture context
- Runtime behavior is primarily wired through `initTaskTimerClient()` in `src/app/tasktimer/tasktimerClient.ts`.
- Components are modular, but many interactions are ID/class/data-attribute based (`getElementById`, delegated click handlers).
- Preserve IDs and selector hooks in JSX when editing UI.
- Main stylesheet in active use is `src/app/tasktimer/tasktimer.css`.
- `src/app/tasktimer/styles/tasktimer.css` also exists; avoid unintended dual edits.

## Modes and categories
- Task categories are implemented as three internal modes: `mode1`, `mode2`, `mode3`.
- Current default labels are `Category 1`, `Category 2`, `Category 3`.
- Mode/category settings persist via localStorage key `${STORAGE_KEY}:modeSettings`.
- Legacy fallback key `${STORAGE_KEY}:modeLabels` is still read for backward compatibility.
- Mode 1 is always enabled; Mode 2 and Mode 3 can be enabled/disabled in Category Manager.

## Settings and overlays
- Settings UI is shared via `src/app/tasktimer/components/SettingsPanel.tsx` and used on `/tasktimer/settings`.
- Category Manager is implemented as an overlay in `src/app/tasktimer/components/InfoOverlays.tsx` and opened via `data-menu="categoryManager"`.
- Common overlays and controls depend on stable IDs (e.g. `aboutOverlay`, `howtoOverlay`, `appearanceOverlay`, `categoryManagerOverlay`, `confirmOverlay`).

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
  - Encoding issues (unexpected replacement characters or mojibake).
  - Lint status via `npm run lint` (warnings are currently present but non-blocking).

## Git hygiene
- Do not revert unrelated local changes.
- Keep diffs focused and easy to review.
