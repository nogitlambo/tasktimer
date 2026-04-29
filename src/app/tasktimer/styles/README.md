# TaskTimer Styles Ownership

`src/app/tasktimer/styles/*` is the authoritative editing surface for TaskTimer CSS.

`src/app/tasktimer/tasktimer.css` is a thin bundle entrypoint only. It should only contain `@import` statements that load the split stylesheets.

Current ownership:

- `00-base.css`: base tokens, typography, shared app primitives
- `01-shell.css`: app shell and shared page shell layout
- `02-tasks.css`: Tasks route
- `03-dashboard.css`: dashboard base styling
- `04-overlays.css`: shared overlays and modals
- `05-history-manager.css`: History Manager
- `06-settings.css`: Settings, Account, About, rank ladder
- `08-feedback.css`: Feedback route
- `08-friends.css`: Friends route
- `09-desktop-rail.css`: desktop rail base styling
- `10-responsive.css`: breakpoint-specific overrides, including mobile dashboard and mobile Archie behavior

Editing rules:

- Do not add new route/component rules to `tasktimer.css`.
- Prefer the narrowest owner file for any new rule.
- Use route-scoped selectors where practical.
- Avoid new comment chains labeled `Final`, `Canonical`, or `authoritative`; resolve ownership instead.
- Run `npm run css:audit:tasktimer` after meaningful CSS cleanup work.
- Use `npm run css:audit:tasktimer:duplicates` to focus on cross-file and same-file selector collisions.
- Use `npm run css:audit:tasktimer:important` to inspect `!important` hotspots by file and selector block.
- Use `npm run css:audit:tasktimer:orphans` to inspect likely orphaned class/id/data selector atoms.
