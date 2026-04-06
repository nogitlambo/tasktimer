# Design System

## Overview
TaskTimer uses a dark, high-contrast productivity UI with a futuristic console feel. The interface is intentionally sharp and compact, built around neon accents, glassy panels, and slanted control shapes instead of soft SaaS styling.

The visual system should feel focused, dense, and deliberate. Cyan is the default accent language, with purple as a first-class alternate theme that should receive equivalent treatment anywhere new UI is introduced.

## Core Principles
- Keep the interface dark, crisp, and information-dense.
- Prefer sharp or slanted geometry over soft rounded cards.
- Reuse shared app patterns before introducing new variants.
- Preserve cyan and purple theme parity for any new surface or state.
- Use glow and accent color sparingly so important actions still stand out.

## Color System

### Base Surfaces
- **Background**: `#0d0f13`
- **Panel**: `#12182a`
- **Card**: `#111a2b`
- **Secondary Card**: `#0f1a31`
- **Primary Text**: `#e9eef9`
- **Muted Text**: `rgba(255,255,255,.6)`

### Accent Colors
- **Primary Accent**: `#00cfc8`
- **Accent Secondary**: `#00b8b2`
- **Accent Highlight / Glow**: `#35e8ff`
- **Mode 2 Accent**: `#3a86ff`
- **Mode 3 Accent**: `#ff6b6b`
- **Warning / Error**: `#ff4d4d`

### Purple Theme Equivalents
- **Purple Accent**: `#d447d2`
- **Purple Accent Secondary**: `#b63bc3`
- **Purple Accent Highlight**: `#f06ee0`
- **Purple Warning**: `#ff5a8d`

## Typography
- **Primary UI Font**: Orbitron via the app font tokens
- **Readable Font Token**: `--font-readable`
- **Display Font Token**: `--font-display-ui`
- **Headlines**: Bold, compact, often uppercase
- **Body Text**: Compact and high-contrast, typically around 14 to 16px
- **Labels**: 10 to 12px, bold, uppercase, increased letter spacing
- **Numeric Displays**: Tight futuristic styling with tabular numerals and subtle neon glow where appropriate

## Shape Language
- Default app styling favors sharp edges and slanted/parallelogram silhouettes.
- Main shells, panels, overlays, and controls should not drift into generic rounded SaaS styling.
- Rounded pills are still used in parts of the shared button system, but the overall direction is angular and technical.
- If a control style already uses the app slant treatment, preserve it.

## Components

### Buttons
- Use the shared button classes: `btn`, `btn-accent`, `btn-ghost`, `btn-warn`, `iconBtn`
- **Primary buttons** use the accent gradient and glow treatment
- **Secondary buttons** use dark translucent fills with light borders
- **Destructive buttons** use red-tinted fills and lighter red text/borders
- Important task-facing and modal-facing controls should match the existing app button language rather than introducing a new button family

### Inputs
- Inputs use dark translucent backgrounds with subtle borders
- Focus states should use accent-colored borders and light glow, not browser-default styling
- Avoid bright light-field inputs or heavy fill contrast that breaks the dark system

### Cards and Panels
- Panels rely on dark fills, border contrast, subtle gradients, and restrained glow
- Visual separation should come from surface layering and borders, not heavy elevation alone
- New cards should feel compatible with task cards, dashboard panels, and overlays already in the app

### Modals and Overlays
- New modals should follow the existing TaskTimer overlay/modal pattern
- Use dark glass-style panels with compact headings and shared button treatments
- Avoid creating one-off modal palettes or custom modal component systems unless absolutely necessary

### Switches and Toggles
- Reuse the shared `.switch` system
- Default switch sizing should match current app usage, especially in settings and modal contexts
- Do not create custom toggle chrome when the shared switch is sufficient

## Motion and Effects
- Use subtle motion for hover, focus, panel transitions, and active states
- Prefer restrained glow, highlight, and border animation over flashy motion
- Motion should support clarity and responsiveness, not distract from the app’s functional purpose

## Do
- Keep new UI aligned with the dark neon console aesthetic
- Preserve slanted control language where the app already uses it
- Use the existing font tokens instead of introducing a new type system
- Maintain readable contrast across both cyan and purple themes
- Reuse existing component classes and visual patterns whenever possible

## Avoid
- Generic blue enterprise dashboard styling
- Soft white cards or bright neutral backgrounds
- Mixing heavily rounded SaaS elements into angular TaskTimer views
- Introducing new font stacks or disconnected button styles
- Creating theme support for cyan only without matching purple behavior
