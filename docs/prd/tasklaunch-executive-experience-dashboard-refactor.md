# TaskLaunch Executive Experience --- Dashboard & Information Architecture Refactor

## Codex Implementation Specification

**Status:** Ready for implementation planning\
**Product:** TaskLaunch\
**Change type:** UI / Information Architecture / Executive Function
integration\
**Primary goal:** Reduce Dashboard clutter by consolidating Executive
Function features into a dedicated Executive experience while preserving
existing feature behaviour, service contracts, selector hooks, and
workflows.

## 1. Background

TaskLaunch now exposes Daily Executive Brief, Adaptive Daily Capacity,
Next Best Action, Automatic Schedule Repair, Recovery Mode, Task
Clarification, and Trusted Automation. These are currently represented
too directly as separate Dashboard panels.

The UI should present them as one coherent Executive Function experience
rather than expose the underlying service architecture.

## 2. Product Model

> **Dashboard = How am I doing?**

> **Executive = What should I do?**

Dashboard remains the productivity/performance overview. A new Executive
route becomes the workspace for current-day decision support, planning
intelligence, interventions, and Executive Function tools.

## 3. Core Design Principle

> Normal states should be quiet. Exceptional states should surface
> themselves.

Schedule Repair and Recovery Mode should become prominent when relevant,
not consume permanent Dashboard space. Capacity should normally be
compact. Next Best Action should remain highly prominent because it
directly moves the user into action.

## 4. Navigation

Add a primary navigation item:

``` text
Dashboard
Notes
Tasks
Executive
Friends
Leaderboards
```

Recommended route:

``` text
/executive
```

Reuse existing TaskLaunch navigation, routing, responsive, active-state,
and selector-hook conventions.

## 5. Dashboard Refactor

Preserve existing performance surfaces such as progress, momentum,
XP/rank, task progress, heatmap, and existing analytics.

Remove these as permanent standalone Dashboard cards:

-   Today's Capacity
-   Next Best Action
-   Schedule Repair
-   Recovery Mode

Replace the large Daily Executive Brief presentation and these cards
with one consolidated **Executive Summary**.

Do not remove their underlying services or feature flows.

## 6. Dashboard Executive Summary

Example:

``` text
EXECUTIVE

Today looks slightly overloaded
46–65 min capacity remaining

NEXT
Tidy small area · 11 min

110 min planned · 46–65 min realistic

[Start now]    [Open Executive →]
```

Reuse existing Daily Brief, Capacity, NBA, planned workload, and
first-action state. Do not implement new ranking, capacity, or
plan-health logic.

**Start now** uses the existing NBA/task timer flow.

**Open Executive** navigates to `/executive`.

If NBA is unavailable, omit Start now. If Executive data fails, render a
compact safe fallback without breaking Dashboard.

## 7. Executive Route Hierarchy

Create `/executive` with this hierarchy:

``` text
EXECUTIVE
    │
    ├── Today / Plan Health
    ├── Next Best Action
    ├── Today's Plan
    ├── Needs Attention
    └── Executive Tools
```

Do not simply move the five existing Dashboard cards to a new page.

## 8. Today Header

Example:

``` text
EXECUTIVE
────────────────────────────────────────────

TODAY                                      46–65 min remaining
Slightly overloaded                       Strong capacity

You have 110 minutes of work remaining.
About 46–65 minutes realistically fits.
```

Use compact indicators for plan health, remaining capacity, planned
work, and capacity state.

## 9. Next Best Action --- Primary Surface

NBA should be the most visually prominent actionable component.

``` text
NEXT BEST ACTION

Tidy small area

Start here:
Start with the smallest visible step.

11 min · Medium confidence

Fits within your remaining capacity and aligns
with your current focus window.

[ START NOW ]       [ Alternative ]

Why this? ▾
```

Reuse existing Start now, Alternative, Not now where appropriate, Why
this, and timer/session handoff.

Do not create a second NBA implementation.

## 10. Progressive Explainability

Collapse secondary explanations by default.

Example:

``` text
Why this? ▾
```

Expanded:

``` text
✓ Fits your remaining capacity
✓ Matches your current focus window
✓ Has a clear first action
```

Reasons must derive from existing deterministic reason codes.

## 11. Today's Plan

Combine Daily Executive Brief and Adaptive Daily Capacity into a
coherent presentation:

``` text
TODAY'S PLAN

110m planned             46–65m realistic

████████████████████████████░░░

Your current plan is slightly overloaded.
```

May show planned minutes, realistic range, completed work, plan health,
deadline risk, and existing safe-adjustment summary.

Do not independently calculate these values.

## 12. Capacity Presentation

Capacity becomes compact:

``` text
CAPACITY
46–65 min remaining
Strong · Medium confidence

How was this calculated? ▾
[Adjust today]
```

Reuse existing capacity reason/source data and override flow.

## 13. Needs Attention

Create a contextual section only when actionable state exists.

Potential items:

-   Deadline risk
-   Schedule Repair available
-   Recovery Mode recommended
-   Important/current task requiring clarification

Example:

``` text
NEEDS ATTENTION

Your remaining plan exceeds today's capacity.

TaskLaunch found 2 safe adjustments.

[Review suggested repair]
```

If nothing needs attention, omit the section where practical rather than
allocating a large empty card.

## 14. Schedule Repair

No permanent Schedule Repair Dashboard panel.

When relevant:

``` text
PLAN NEEDS ATTENTION

You have 110 min remaining but about
46–65 min of realistic capacity.

TaskLaunch found 2 safe adjustments.

[Review suggested repair]
```

Reuse existing Schedule Repair eligibility, proposal, review, and apply
flow.

## 15. Recovery Mode

No permanent Recovery Mode Dashboard panel.

Manual access belongs under Executive Tools.

When existing deterministic eligibility recommends recovery, elevate it
into Needs Attention:

``` text
RECOVERY SUGGESTED

12 tasks have carried over, but only
3 need attention soon.

[Open Recovery Mode]
```

Reuse existing Recovery Mode services.

## 16. Executive Tools

Create a visually subordinate tools area:

``` text
EXECUTIVE TOOLS

[ Repair today's plan ]
[ Recovery Mode ]
[ Adjust capacity ]
[ Brain Dump ]
```

Automation settings or contextual Task Clarification may also be exposed
where appropriate.

## 17. Daily Executive Brief Role

Treat Daily Executive Brief as the primary aggregation/presentation
source rather than another peer panel:

``` text
                 EXECUTIVE
                     │
          Daily Executive Brief
                     │
       ┌─────────────┼──────────────┐
       ▼             ▼              ▼
    Capacity     Next Action    Plan Health
                                    │
                              Schedule Repair
                                    │
                              Recovery Mode
```

This is a presentation hierarchy only. Existing feature service
ownership remains unchanged.

## 18. Contextual Intervention Rules

Do not create new eligibility algorithms.

-   Schedule Repair surfaces when existing repair logic warrants it.
-   Recovery Mode surfaces when existing recovery eligibility warrants
    it.
-   Task Clarification routes through the existing workflow.
-   Capacity remains available but compact.
-   NBA remains the primary recommendation.

## 19. Responsive Behaviour

Desktop recommendation:

``` text
┌──────────────────────────────────────────────┐
│ Executive Header / Today                    │
├────────────────────────────┬─────────────────┤
│ Next Best Action           │ Today's Plan    │
│                            │ / Capacity       │
├────────────────────────────┴─────────────────┤
│ Needs Attention                              │
├──────────────────────────────────────────────┤
│ Executive Tools                              │
└──────────────────────────────────────────────┘
```

Mobile order:

``` text
Today
↓
Next Best Action
↓
Needs Attention
↓
Today's Plan
↓
Capacity
↓
Executive Tools
```

Primary actions should remain reachable without excessive scrolling.

## 20. Loading, Failure, and Stale States

Underlying services may fail independently.

Requirements:

-   One failed service must not blank the page.
-   Preserve usable NBA if another section fails.
-   Preserve Dashboard if Executive data fails.
-   Use existing stale/fallback semantics.
-   Provide targeted retry where supported.
-   Do not expose internal/provider errors.

## 21. Trusted Automation Integration

Trusted Automation should keep derived Executive state current where
existing rules permit.

The Executive UI consumes current feature state rather than implementing
background refresh orchestration.

Do not bypass Trusted Automation trust or policy boundaries.

Avoid multiple unrelated Refresh buttons where one contextual refresh is
sufficient.

## 22. Information Density Rules

1.  Do not show a large card merely to communicate a normal/no-action
    state.
2.  Show the current action before explanatory detail.
3.  Collapse secondary reasoning.
4.  Use compact status indicators for capacity and plan health.
5.  Promote exceptions only when relevant.
6.  Avoid repeating capacity/workload/task information.
7.  Prefer one primary CTA per section.
8.  Preserve detail through progressive disclosure.

## 23. Accessibility

Preserve or improve keyboard navigation, screen-reader landmarks,
heading hierarchy, visible focus, touch targets, accessible
expand/collapse, non-colour-only states, status announcements, reduced
motion, and logical mobile reading order.

## 24. Analytics

Reuse existing feature analytics where possible.

Potential new UI events:

``` text
executive_page_viewed
executive_summary_opened
executive_summary_start_clicked
executive_tool_opened
executive_attention_item_opened
executive_section_expanded
```

Do not include task titles, notes, raw recommendations, or private
content.

## 25. Backward Compatibility

This is primarily a presentation/routing refactor.

-   Do not change Task model contracts.
-   Do not change Executive Function persistence unless technically
    necessary.
-   Preserve existing service APIs.
-   Preserve selector/test hooks where practical.
-   Existing direct feature flows continue working.
-   Deep links remain valid.
-   Do not delete feature code because its Dashboard card is removed.
-   Avoid rewriting stable Executive Function logic.

## 26. MVP Scope

Included:

-   `/executive` route
-   Executive primary navigation item
-   Dashboard Executive Summary
-   Removal of standalone Capacity/NBA/Schedule Repair/Recovery
    Dashboard cards
-   Daily Brief consolidation
-   Prominent NBA
-   Integrated Today's Plan
-   Compact Capacity
-   Contextual Needs Attention
-   Executive Tools
-   Contextual Schedule Repair and Recovery
-   Responsive layout
-   Progressive disclosure
-   Failure/stale handling
-   Accessibility
-   UI analytics
-   Tests

Excluded:

-   New Executive Function algorithms
-   New ranking/capacity/repair/recovery logic
-   Proactive Executive Nudges
-   Redesign of unrelated analytics
-   New AI models
-   New persistence architecture

## 27. Suggested Implementation Order

### Phase 1 --- Route and Shell

1.  Inspect Dashboard/navigation architecture.
2.  Add `/executive`.
3.  Add Executive navigation.
4.  Establish responsive shell.
5.  Add route tests.

### Phase 2 --- Executive Summary

1.  Create consolidated summary component.
2.  Reuse Daily Brief, Capacity and NBA state.
3.  Add Start now.
4.  Add Open Executive.
5.  Add fallback states.
6.  Place summary on Dashboard.

### Phase 3 --- Executive Page

1.  Today header.
2.  Primary NBA section.
3.  Today's Plan.
4.  Compact Capacity.
5.  Progressive explanations.
6.  Responsive behaviour.

### Phase 4 --- Contextual Interventions

1.  Needs Attention.
2.  Schedule Repair state.
3.  Recovery eligibility.
4.  Task Clarification handoff where appropriate.
5.  Executive Tools.

### Phase 5 --- Dashboard Cleanup

1.  Remove standalone NBA panel.
2.  Remove standalone Capacity panel.
3.  Remove standalone Schedule Repair panel.
4.  Remove standalone Recovery panel.
5.  Replace large Daily Brief with Executive Summary.
6.  Verify all feature entry paths remain accessible.

### Phase 6 --- Hardening

1.  Accessibility tests.
2.  Responsive tests.
3.  Loading/failure/stale tests.
4.  Selector-hook regression tests.
5.  Navigation tests.
6.  Executive Function regression suite.
7.  Analytics redaction tests.
8.  E2E tests.

## 28. Acceptance Criteria

The refactor is complete when:

-   `/executive` exists in primary navigation.
-   Dashboard no longer shows Capacity, NBA, Schedule Repair and
    Recovery Mode as separate permanent cards.
-   Dashboard contains one compact Executive Summary.
-   Summary surfaces plan health, remaining capacity and NBA where
    available.
-   Start now uses existing NBA/timer flow.
-   Executive page makes NBA the primary action.
-   Daily Brief and Capacity form a coherent planning experience.
-   Schedule Repair is prominent only when relevant.
-   Recovery Mode is prominent only when relevant.
-   Manual Repair, Recovery and Capacity controls remain accessible.
-   No Executive Function business logic is unnecessarily duplicated.
-   Existing service contracts remain compatible.
-   One service failure does not blank the Executive page.
-   Desktop/mobile layouts and accessibility pass.
-   Existing Executive Function tests continue to pass.

## 29. Codex Implementation Rules

1.  Inspect the repository before proposing implementation issues.
2.  Reuse existing Executive Function services, hooks, selectors,
    components and persistence.
3.  Treat this as an information-architecture/presentation refactor, not
    an Executive Function rewrite.
4.  Do not duplicate NBA, Capacity, Daily Brief, Schedule Repair,
    Recovery Mode or Task Clarification logic.
5.  Preserve selector hooks where practical.
6.  Preserve timer/session handoff.
7.  Preserve ownership/security boundaries.
8.  Preserve Trusted Automation policy boundaries.
9.  Keep normal states visually quiet.
10. Promote exceptional/actionable states contextually.
11. Use progressive disclosure.
12. Do not add new AI calls.
13. Avoid new persistence unless explicitly justified.
14. Follow incremental TDD.
15. Document deviations.

## 30. Recommended First Codex Task

``` text
Review the TaskLaunch Dashboard and current Executive Function UI architecture against this specification.

Before changing code:

1. Inspect the current Dashboard layout, primary navigation, responsive navigation, and route structure.
2. Locate the existing Daily Executive Brief, Adaptive Daily Capacity, Next Best Action, Schedule Repair, and Recovery Mode Dashboard components.
3. Identify the existing hooks/selectors/services used by each panel.
4. Identify tests or selector hooks that depend on current Dashboard placement.
5. Propose dependency-ordered implementation issues for this refactor.
6. Prefer small tracer-bullet issues.
7. Do not redesign or reimplement Executive Function business logic.
8. Flag repository architecture conflicts before implementation.

After review, present the proposed issue breakdown before publishing issues.
```
