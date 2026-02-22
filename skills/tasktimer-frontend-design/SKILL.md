---
name: tasktimer-frontend-design
description: Apply the TaskTimer app's existing frontend visual language (dark neon productivity UI, slanted/parallelogram controls, app fonts, #0d0f13 primary surfaces, existing button classes, and dark/light theme parity). Use when creating or modifying TaskTimer pages, modals, charts, panels, or controls so new UI matches current styling and interaction patterns.
---

# TaskTimer Frontend Design

Use this skill when implementing or updating UI in the TaskTimer app to keep styling consistent with the current product.

## Use Existing Sources First

- Use `src/app/tasktimer/tasktimer.css` as the source of truth for styling.
- Reuse existing component patterns in `src/app/tasktimer/components/*` and `src/app/tasktimer/page.tsx`.
- Preserve IDs and `data-*` hooks used by `src/app/tasktimer/tasktimerClient.ts`.
- For quick reusable snippets/patterns (modal skeletons, icon button states, light-theme overrides), read `references/tasktimer-style-notes.md`.
- Reuse `assets/tasktimer-modal-template.tsx` when adding a new modal and adapt IDs/content to the target feature.

## Visual System

- Use a dark, high-contrast, neon-accent style.
- Default primary surface/background to `#0d0f13` unless the user requests a different color.
- Preserve the slanted/parallelogram control language (`clip-path` with `--control-slant`) where existing UI uses it.
- Use cyan/blue accents for primary/active states.
- Use red accents for destructive states, stopped timers, and lock indicators.

## Typography

- Reuse the app's existing font tokens (`var(--font-...)`).
- Do not introduce new font families unless explicitly requested.
- Match existing hierarchy:
  - compact bold panel titles
  - small uppercase labels/kickers for section headings and chart labels

## Buttons and Controls

- Prefer existing classes:
  - `btn`, `btn-accent`, `btn-ghost`, `iconBtn`
  - `switch` for toggles
- Match existing hover/disabled/opaque states rather than inventing new patterns.
- Keep touch targets usable on mobile.

## Modals and Pages

- New modals and pages must use current app styling by default:
  - app fonts
  - `#0d0f13` backgrounds/surfaces
  - existing button design
  - existing panel/border treatment
- Use existing overlay/modal structure (`.overlay`, `.modal`, `.footerBtns`) unless there is a reason not to.
- Apply light-theme overrides for any new dark-theme UI styles.

## Charts and Data UI

- Keep layout static during selection interactions; prefer opacity and border accents over resizing containers.
- Align new chart controls to existing inline history icon/toggle patterns.
- Use current mode colors where chart data is mode-related.

## Mobile / Responsive Requirements

- Avoid clipped labels, controls, and modal content.
- Respect safe-area spacing for sticky/fixed controls.
- Ensure interactive controls remain accessible on small screens.

## Recent UI Context (keep consistent)

- Inline history Analyse icon (`data-history-action="analyse"`) is inactive/opaque until 2+ columns are lock-selected.
- History Analysis modal (`historyAnalysisOverlay`) exists and should match app modal styling.
- Edit Task modal uses the same app background and slanted modal styling.

## Implementation Checklist

- Reused existing CSS classes/patterns before adding new ones
- Kept `#0d0f13` as primary surface unless explicitly requested otherwise
- Preserved IDs/`data-*` hooks used by `tasktimerClient.ts`
- Added light-theme parity for new UI styles
- Checked mobile layout for clipping/overflow regressions
