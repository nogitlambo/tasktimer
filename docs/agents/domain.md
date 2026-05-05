# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- `CONTEXT.md` at the repo root
- `docs/adr/` if it exists

If any of these files don't exist, proceed silently. Do not flag their absence or suggest creating them upfront.

## File structure

This is a single-context repo:

```text
/
|-- CONTEXT.md
|-- docs/adr/
`-- src/
```

## Use the glossary's vocabulary

When naming domain concepts in issue titles, briefs, refactor proposals, hypotheses, or tests, use the terms defined in `CONTEXT.md`.

If the concept you need is not in the glossary yet, either reconsider the term or note the gap for a future docs pass.

## Flag ADR conflicts

If proposed work contradicts an existing ADR, surface it explicitly instead of silently overriding it.
