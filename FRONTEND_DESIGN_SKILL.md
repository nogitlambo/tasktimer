# Frontend Design Skill: TaskTimer UI Style System

## Purpose
Use this skill when creating or updating frontend UI for the TaskTimer app so all new pages, modals, charts, controls, and states match the existing product styling and interaction language.

## Scope
- Next.js App Router frontend in `src/app/tasktimer/*`
- Primary stylesheet: `src/app/tasktimer/tasktimer.css`
- Runtime interactions wired in `src/app/tasktimer/tasktimerClient.ts`

## Core Design Direction
- Theme: dark, high-contrast, neon-accent productivity UI
- Tone: sleek, technical, focused
- Shape language: slanted/parallelogram controls and panels
- Visual motif: cyan/blue glow accents with red for destructive/stopped/locked states

## Primary Styling Rules

### Backgrounds
- Main app background color: `#0d0f13`
- New pages and modals should default to `#0d0f13` unless explicitly requested otherwise
- Panels/cards should match existing app panel styling and keep current border colors unless the request asks to change them

### Typography
- Reuse existing app font tokens (`var(--font-...)`) already defined in the app
- Avoid introducing new font families/stacks for new UI
- Use current title styles for hierarchy:
  - small all-caps labels/kickers for section headings
  - bold compact headings for panel titles

### Buttons and Controls
- Reuse existing classes and patterns whenever possible:
  - `btn`, `btn-accent`, `btn-ghost`, `iconBtn`
  - `switch` for toggles
- Preserve slanted/parallelogram shape language (`clip-path` with `--control-slant`) for new controls/panels where the app already uses it
- Use accent gradients for primary actions (matching logo/theme)
- Use red accents for destructive actions, stopped states, and locked selections

### Modals and Overlays
- New overlays should use the same modal structure and styling conventions:
  - `.overlay`
  - `.modal`
  - `footerBtns` action row
- Apply the current app styling by default:
  - app fonts
  - `#0d0f13` background
  - existing button system
  - slanted modal shape when consistent with surrounding UI
- Include dark/light theme parity for any new modal styles

### Charts and Data UI
- Inline history chart uses the current mode colors where applicable
- Selection/lock states use border accents and opacity changes rather than large layout shifts
- New chart controls should visually align with top icon buttons and existing toggle pills

## Interaction Patterns to Preserve
- Keep UI behavior static where possible; avoid layout shifts on selection states
- Use opacity and border accents to indicate disabled/inactive/selected/locked states
- Mobile-first usability matters:
  - touch-friendly hit areas
  - avoid clipped content
  - avoid controls drifting under safe areas / nav bars

## Theme Parity Requirement
When adding new dark-theme UI styles, add or verify matching light-theme overrides in `tasktimer.css` if needed.

## Implementation Checklist (for new UI)
- Uses `#0d0f13` for primary surface/background (unless user requests otherwise)
- Uses existing font tokens / typography style
- Uses existing button classes and switch/icon patterns
- Matches slanted/parallelogram control language where appropriate
- Includes dark/light theme parity
- Preserves IDs/data hooks if UI is wired by `tasktimerClient.ts`
- Avoids introducing layout regressions on mobile

## Relevant Current UI Context (recent)
- History Analysis modal (`historyAnalysisOverlay`) now exists and should remain visually consistent with app modals
- Inline history Analyse action (`data-history-action="analyse"`) is intentionally inactive/opaque until 2+ columns are lock-selected
- Edit Task modal and other new overlays are expected to follow the same app background and button styling conventions

## File References
- `src/app/tasktimer/tasktimer.css`
- `src/app/tasktimer/tasktimerClient.ts`
- `src/app/tasktimer/page.tsx`
- `src/app/tasktimer/components/*`
