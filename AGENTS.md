# AGENTS.md

## Project
- App: Next.js (App Router) TaskTimer app
- Main route: `/tasktimer`
- Key files: `src/app/tasktimer/page.tsx`, `src/app/tasktimer/tasktimerClient.ts`, `src/app/tasktimer/lib/*`, `src/app/tasktimer/components/*`

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
  - Encoding issues (unexpected replacement characters or mojibake).

## Git hygiene
- Do not revert unrelated local changes.
- Keep diffs focused and easy to review.
