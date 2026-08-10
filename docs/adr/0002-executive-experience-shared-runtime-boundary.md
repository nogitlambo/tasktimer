# Executive Experience Shared Runtime Boundary

## Status

Accepted.

TaskLaunch will implement the Executive experience as a shared `AppPage` in the existing TaskTimer runtime, with `/executive` as its direct route entry point. This preserves the established authentication, navigation, responsive shell, runtime composition, service ownership, and selector-hook boundaries while allowing Executive to become a distinct information architecture surface. A separate route-mounted runtime was rejected because it would duplicate shell and feature wiring and make the presentation refactor harder to keep behavior-compatible.

The Executive presentation will compose existing feature endpoints and client workflows rather than introduce a new aggregate `/api/executive` endpoint. Daily Executive Brief remains the canonical plan and Next Best Action source; Capacity, Schedule Repair, and Recovery retain their independent service and failure boundaries. This keeps the refactor presentation-focused and preserves targeted retry, stale handling, and explicit mutation workflows.

Executive is a desktop primary-navigation destination in the initial release. It is intentionally omitted from the mobile footer for now; direct `/executive` navigation remains valid on all supported layouts.

Executive-owned presentation components may reuse feature parsers, API requests, mutation flows, telemetry, and stale/error semantics, but they must not reuse the existing Dashboard card layout as the Executive information architecture. Feature behavior remains shared; presentation ownership follows the surface.

The Daily Executive Brief's embedded NBA is authoritative for initial Executive rendering only when its contract proves that it is the same current active recommendation, not merely a valid brief snapshot. The current contracts have independent lifecycles (brief snapshots may live for six hours while NBA recommendations live for 30 minutes), so Executive must validate freshness or obtain the current NBA before presenting the embedded recommendation as actionable. NBA mutations continue to use the standalone recommendation identity and lifecycle.

For the MVP, Executive obtains the current actionable NBA from the standalone NBA endpoint. The embedded brief recommendation may provide non-actionable bootstrap/context but must not be presented as current without freshness proof.

Dashboard Executive Summary and the full Executive surface share a client-side data/view-model coordinator with surface-specific renderers. This prevents conflicting current recommendations and duplicated refresh orchestration without creating a server-side aggregate endpoint.

The `/executive` route is available to authenticated users regardless of plan. Existing Executive Function entitlement gates remain per feature/tool, with locked states and upgrade actions shown in place rather than redirecting or hiding the entire destination.

The full Executive surface remains responsive and mobile-usable even though the initial primary-navigation entry is desktop-only; Dashboard's `Open Executive` action is the mobile entry path.

Needs Attention is conditional: when no actionable intervention exists, the section is omitted rather than rendered as an empty status card. Manual intervention tools remain available separately.

NBA explainability is progressive: the validated existing explanation is the collapsed summary, and expansion reveals only relevant existing deterministic reason codes. Executive does not add ranking signals or UI-generated rationale.

Removed Executive Dashboard card IDs in persisted dashboard configuration are ignored by the active Dashboard registry and are not reinterpreted as Executive layout state. Existing stored configuration remains compatible and is not destructively migrated solely because the presentation moved.

Executive adds no new persistence architecture for route state, section expansion, or intervention discovery. Existing Capacity overrides, recommendation lifecycles, Schedule Repair proposals, Recovery sessions, and Trusted Automation policy remain the authoritative persisted state.

Trusted Automation remains responsible for permitted background refresh orchestration and policy boundaries. The Executive UI consumes current feature state and provides contextual/manual refresh only where the existing feature workflow supports it; it does not add background timers or bypass trust policy.

Executive UI analytics reuse existing feature telemetry and add only privacy-safe surface events and bounded state/interaction metadata. Events must not include task titles, notes, raw recommendations, Brain Dump content, or other private task content.

Daily Executive Brief remains the canonical source for current plan facts (workload, plan health, deadline risk, adjustments, and deterministic summary), because its source-version checks include current task and Capacity inputs. Its existing validated summary provider may be used, with the deterministic summary as the safe fallback; Executive adds no new AI call.

Task Clarification appears contextually only from the Daily Brief's existing clarification task IDs and routes through the established clarification workflow. Executive does not create a second clarification eligibility rule.

Executive sections load and fail independently. Partial Executive state remains usable when one service is unavailable, and the Dashboard summary degrades to a compact safe fallback rather than blocking the Dashboard or exposing provider/internal errors.

Executive runs existing Schedule Repair and Recovery eligibility checks when the Executive surface is entered and promotes only actionable results into Needs Attention. The Dashboard summary does not trigger those intervention checks; explicit Executive tool actions may force-refresh or open the existing workflows.

Executive Tools are thin access points to existing workflows: Schedule Repair review, Recovery Mode, Capacity override, and the `/brain-dump` route. They do not introduce parallel editors or mutation logic.
