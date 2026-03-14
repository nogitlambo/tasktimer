# Architecture

This document describes the repository as it exists today. It is intended as a maintainer and onboarding overview, not a complete API reference.

## Repository Overview

This repo is a Next.js 16 App Router application with Firebase-backed authentication and data access. The main product surface is the TaskTimer app under `/tasktimer`, but the repo also contains shared landing, auth, privacy, and API entrypoints.

At a high level:

- `src/app` contains the Next.js route tree and page composition.
- `src/lib` contains shared Firebase client setup used across route surfaces.
- `src/app/tasktimer` contains the TaskTimer route tree plus a large legacy imperative runtime and its route-local components/styles/libs.
- `src/features/tasktimer-react` contains an in-repo React-based TaskTimer feature module that is currently secondary to the active `/tasktimer` runtime.

The TaskTimer codebase is currently in a hybrid state, but the active `/tasktimer` experience now boots through the legacy DOM-wired client runtime for consistency across direct loads and in-app page switching. The React feature module still exists in the repo, but it is not the active route path for the Tasks screen.

## Top-Level Directory Map

### `src/app`

The Next.js App Router entrypoint. Current notable areas include:

- `page.tsx`: landing/sign-in surface for the web app.
- `privacy/`: privacy route and back-navigation behavior.
- `tasktimer/`: the main authenticated TaskTimer sub-app.
- `api/`: API route handlers and static API-adjacent assets.
- shared app shell files such as `layout.tsx`, `globals.css`, and `not-found.tsx`.

### `src/lib`

Shared client integrations used outside of TaskTimer-specific code:

- `firebaseClient.ts`: Firebase app/auth initialization, runtime detection, and auth mode selection.
- `firebaseFirestoreClient.ts`: Firestore client initialization on top of the shared Firebase app.

### `src/app/tasktimer`

The TaskTimer application surface, including:

- route pages and layout
- TaskTimer composition and bootstrap code
- legacy client runtime and DOM wiring
- TaskTimer-specific components
- domain libs for storage, history, rewards, friends, colors, time, and related behavior
- split CSS files imported through `tasktimer.css`

### `src/features/tasktimer-react`

The newer React feature module for TaskTimer tasks, split into:

- `components/`: provider and screen-level React components
- `hooks/`: state and action access hooks
- `model/`: reducer, selectors, config, and types
- `adapters/`: browser/runtime integration points such as navigation and storage bridging

## Application Runtime Overview

The global application runtime is standard Next.js App Router plus client-side Firebase integration.

There are three main runtime layers:

1. Next.js route composition
2. shared auth / Firebase clients
3. TaskTimer-specific UI/runtime logic

The landing route in [`src/app/page.tsx`](/s:/Apps/repo/tasktimer-app/src/app/page.tsx) handles sign-in flows, email-link auth completion, Google sign-in, and redirect into TaskTimer after authentication.

Shared Firebase behavior lives in:

- [`src/lib/firebaseClient.ts`](/s:/Apps/repo/tasktimer-app/src/lib/firebaseClient.ts)
- [`src/lib/firebaseFirestoreClient.ts`](/s:/Apps/repo/tasktimer-app/src/lib/firebaseFirestoreClient.ts)

`firebaseClient.ts` is responsible for:

- building Firebase config from environment variables
- selecting native/file vs web auth mode
- initializing the Firebase app and Auth client only on the client

`firebaseFirestoreClient.ts` builds the Firestore client from the shared Firebase app and configured database ID.

## Routing And Auth Flow

The repo uses App Router route segments under `src/app`.

TaskTimer routes currently include:

- `/tasktimer`
- `/tasktimer/history-manager`
- `/tasktimer/settings`
- `/tasktimer/user-guide`

All `/tasktimer/*` routes are protected by [`src/app/tasktimer/layout.tsx`](/s:/Apps/repo/tasktimer-app/src/app/tasktimer/layout.tsx). That layout:

- initializes an auth guard on the client
- redirects unauthenticated users to `/`
- only renders TaskTimer children once auth state is confirmed

This means TaskTimer pages assume authenticated access and can depend on the auth gate being in place above them.

## TaskTimer Architecture

### Composition Boundary

[`src/app/tasktimer/TaskTimerPageClient.tsx`](/s:/Apps/repo/tasktimer-app/src/app/tasktimer/TaskTimerPageClient.tsx) is the main composition boundary for the TaskTimer UI.

It pulls together:

- shared TaskTimer shell UI such as the top bar and navigation
- route-local overlays and screens from `src/app/tasktimer/components`
- the legacy imperative runtime via `initTaskTimerClient(initialAppPage)`

This file is the clearest place to understand how route composition hands control to the active TaskTimer runtime.

### Active Runtime vs Secondary React Module

The current active route behavior is:

- Tasks page: imperative DOM client runtime
- Dashboard, Friends, and other TaskTimer app pages: imperative DOM client runtime

In `TaskTimerPageClient.tsx`:

- it calls `initTaskTimerClient(initialAppPage)` and renders the route-local structure expected by the imperative runtime for `/tasktimer`, dashboard, and friends surfaces
- this keeps direct `/tasktimer` loads and in-app navigation on the same implementation path

The React feature module remains in the codebase as a secondary architecture track, but it is not currently the route-mounted Tasks implementation.

### Legacy TaskTimer Path

The legacy runtime is centered on [`src/app/tasktimer/tasktimerClient.ts`](/s:/Apps/repo/tasktimer-app/src/app/tasktimer/tasktimerClient.ts).

That file still owns a large amount of behavior, including:

- initial state hydration
- DOM element collection and delegated event wiring
- navigation between legacy TaskTimer pages
- storage/history interactions
- rendering and updating non-React parts of the UI

Supporting legacy runtime helpers live under:

- `src/app/tasktimer/client/`
  - `elements.ts`
  - `runtime.ts`
  - `state.ts`
  - `types.ts`

These modules support the imperative client bootstrap by separating:

- element lookup
- runtime lifecycle/timers/listeners
- initial state creation
- client-facing types

### Secondary React TaskTimer Module

The React feature entrypoints are re-exported from [`src/features/tasktimer-react/index.ts`](/s:/Apps/repo/tasktimer-app/src/features/tasktimer-react/index.ts):

- `TaskTimerProvider`
- `TaskTimerTasksScreen`
- `TaskTimerOverlays`
- feature hooks for state/actions/task selection

Internally the feature module is split by responsibility:

- `components/`
  - React composition and rendering for the tasks experience
- `hooks/`
  - public hooks for reading state and dispatching actions
- `model/`
  - reducer, selectors, feature config, types, and tests
- `adapters/`
  - integration with browser/runtime concerns such as navigation and persistence

This feature module still exists as an architectural direction for more maintainable TaskTimer behavior, but it currently coexists as a secondary path rather than the live `/tasktimer` route implementation.

### Route-Local Components And Overlays

`src/app/tasktimer/components/` contains route-local UI pieces such as:

- overlays
- settings screens/panels
- desktop/mobile navigation shell elements
- dashboard and related presentation pieces

Many of these components still expose stable IDs and selector hooks because the legacy runtime depends on direct DOM access and delegated handlers.

## TaskTimer Data And State Flow

TaskTimer state is currently handled through two parallel styles, depending on the feature surface.

### Legacy State Flow

The legacy path generally follows this shape:

1. `TaskTimerPageClient.tsx` mounts legacy markup.
2. `initTaskTimerClient()` bootstraps the runtime.
3. Initial state is built from storage/cache helpers.
4. Event listeners are attached using collected DOM references and delegated selectors.
5. State updates flow through imperative helpers and re-render/update functions.

Legacy domain logic is concentrated under `src/app/tasktimer/lib/`, which includes:

- `storage.ts`
- `history.ts`
- `historyChart.ts`
- `historyManager.ts`
- `tasks.ts`
- `rewards.ts`
- `friendsStore.ts`
- `colors.ts`
- `time.ts`
- and related tasktimer-specific helpers

### React Feature State Flow

The React Tasks experience generally follows this shape:

1. `TaskTimerProvider` owns feature state and context.
2. `model/` reducer and selectors define state transitions and reads.
3. `hooks/` expose state and actions to UI components.
4. `adapters/` connect the feature model to browser/runtime behavior such as navigation or persistence.
5. `components/` render the task list, task cards, overlays, and inline interactions from provider state.

This path is more explicit and testable than the legacy imperative flow, but it is not currently the mounted route path for `/tasktimer`.

## Styling System And Responsive Layering

TaskTimer styling is imported through [`src/app/tasktimer/tasktimer.css`](/s:/Apps/repo/tasktimer-app/src/app/tasktimer/tasktimer.css), which aggregates the split CSS files under `src/app/tasktimer/styles/`.

Important characteristics of the styling system:

- CSS is layered across multiple imported files such as base, shell, tasks, dashboard, overlays, settings, responsive, and legacy light-theme files; active theme selectors now target `purple` and `cyan`.
- Many route/media-specific overrides are repeated later in the cascade.
- Final authoritative behavior often depends on the last applicable route-scoped block, especially in `10-responsive.css`.

This is especially important for:

- mobile footer anchoring and reserved scroll space
- dashboard action-bar and dropdown behavior
- route-scoped layout exceptions for settings/user-guide/dashboard
- clipping-sensitive combinations of `overflow`, `clip-path`, and `position`

Because of this layering model, changing an earlier selector is often not enough; later route-scoped responsive overrides may still win.

## Current Constraints And Migration Notes

The current architecture has several important constraints:

- Many legacy interactions still depend on stable DOM IDs and delegated `data-*` selectors.
- `tasktimerClient.ts` remains a central integration point for non-React TaskTimer behavior.
- The CSS system is powerful but fragile due to repeated route/media overrides.
- Mobile behavior, especially on dashboard/footer surfaces, is sensitive to clipping and overflow rules across multiple ancestors.
- The repository is in a hybrid migration phase: React and imperative patterns coexist intentionally.

Practical implications:

- Preserve IDs and selector hooks when modifying TaskTimer UI.
- Treat `TaskTimerPageClient.tsx` as the boundary between route composition and the active imperative TaskTimer runtime.
- When debugging style issues, inspect later route-scoped blocks in `10-responsive.css` before assuming a base rule is authoritative.
- When extending the React feature module, document whether the change is exploratory/secondary or intended to replace the active route runtime.

## Summary

This repository is a Next.js app with shared Firebase infrastructure and a TaskTimer sub-app that is still hybrid, but whose active `/tasktimer` route currently runs through the imperative DOM-driven runtime.

The most important files to understand first are:

- [`src/app/page.tsx`](/s:/Apps/repo/tasktimer-app/src/app/page.tsx)
- [`src/app/tasktimer/layout.tsx`](/s:/Apps/repo/tasktimer-app/src/app/tasktimer/layout.tsx)
- [`src/app/tasktimer/TaskTimerPageClient.tsx`](/s:/Apps/repo/tasktimer-app/src/app/tasktimer/TaskTimerPageClient.tsx)
- [`src/app/tasktimer/tasktimerClient.ts`](/s:/Apps/repo/tasktimer-app/src/app/tasktimer/tasktimerClient.ts)
- [`src/features/tasktimer-react/index.ts`](/s:/Apps/repo/tasktimer-app/src/features/tasktimer-react/index.ts)
- [`src/lib/firebaseClient.ts`](/s:/Apps/repo/tasktimer-app/src/lib/firebaseClient.ts)

Together these define the current route structure, auth boundaries, runtime split, and the direction of the ongoing TaskTimer architecture transition.
