import { parseAutomationEventEnvelope, type AutomationEventEnvelope } from "./trustedAutomationContract";

export const PROPAGATION_STAGE_VALUES = [
  "CAPACITY_SNAPSHOT",
  "DAILY_BRIEF",
  "NEXT_BEST_ACTION",
  "SCHEDULE_REPAIR",
  "RECOVERY_MODE",
  "BRAIN_DUMP",
  "TASK_CLARIFICATION",
] as const;

export type PropagationStage = (typeof PROPAGATION_STAGE_VALUES)[number];
export type PropagationOrigin = "USER" | "SECURITY" | "RECOVERY" | "SCHEDULE_REPAIR" | "PLANNING" | "BACKGROUND";

export type PropagationEvent = AutomationEventEnvelope & { origin?: PropagationOrigin };

export type PropagationStageResult =
  | { stage: PropagationStage; kind: "COMPLETED" }
  | { stage: PropagationStage; kind: "REPLAYED" }
  | { stage: PropagationStage; kind: "SKIPPED"; reason: "STALE_DEPENDENCY" | "PRIORITY_CONFLICT" | "NO_HANDLER" }
  | { stage: PropagationStage; kind: "FAILED"; reason: "DEPENDENCY_FAILED" };

export type PropagationResult =
  | { kind: "PROPAGATED"; eventId: string; stages: PropagationStageResult[] }
  | { kind: "SKIPPED"; eventId: string; reason: "INVALID_EVENT" | "NO_CHAIN" | "PRIORITY_CONFLICT" };

const stageRank: Record<PropagationOrigin, number> = {
  USER: 0,
  SECURITY: 1,
  RECOVERY: 2,
  SCHEDULE_REPAIR: 3,
  PLANNING: 4,
  BACKGROUND: 5,
};

const chainByEvent: Partial<Record<PropagationEvent["eventType"], readonly PropagationStage[]>> = {
  TASK_CREATED: ["CAPACITY_SNAPSHOT", "DAILY_BRIEF", "NEXT_BEST_ACTION", "SCHEDULE_REPAIR", "RECOVERY_MODE"],
  TASK_UPDATED: ["CAPACITY_SNAPSHOT", "DAILY_BRIEF", "NEXT_BEST_ACTION", "SCHEDULE_REPAIR", "RECOVERY_MODE"],
  TASK_COMPLETED: ["CAPACITY_SNAPSHOT", "DAILY_BRIEF", "NEXT_BEST_ACTION", "SCHEDULE_REPAIR", "RECOVERY_MODE"],
  TASK_POSTPONED: ["CAPACITY_SNAPSHOT", "DAILY_BRIEF", "NEXT_BEST_ACTION", "SCHEDULE_REPAIR", "RECOVERY_MODE"],
  SCHEDULE_REPAIR_APPLIED: ["CAPACITY_SNAPSHOT", "DAILY_BRIEF", "NEXT_BEST_ACTION", "RECOVERY_MODE"],
  RECOVERY_COMPLETED: ["CAPACITY_SNAPSHOT", "DAILY_BRIEF", "NEXT_BEST_ACTION", "SCHEDULE_REPAIR"],
  DAILY_BRIEF_STALE: ["DAILY_BRIEF", "NEXT_BEST_ACTION"],
  CAPACITY_UPDATED: ["CAPACITY_SNAPSHOT", "DAILY_BRIEF", "NEXT_BEST_ACTION"],
  NEXT_BEST_ACTION_CREATED: ["DAILY_BRIEF"],
};

function inferredOrigin(event: PropagationEvent): PropagationOrigin {
  if (event.origin) return event.origin;
  if (event.eventType === "RECOVERY_STARTED" || event.eventType === "RECOVERY_COMPLETED") return "RECOVERY";
  if (event.eventType === "SCHEDULE_REPAIR_CREATED" || event.eventType === "SCHEDULE_REPAIR_APPLIED") return "SCHEDULE_REPAIR";
  if (event.eventType.startsWith("AUTOMATION_")) return "BACKGROUND";
  if (event.eventType === "DAILY_BRIEF_GENERATED" || event.eventType === "DAILY_BRIEF_STALE" || event.eventType === "CAPACITY_UPDATED" || event.eventType.startsWith("NEXT_BEST_ACTION_")) return "PLANNING";
  return "USER";
}

export function propagationChainFor(eventType: PropagationEvent["eventType"]) {
  return [...(chainByEvent[eventType] || [])];
}

export function propagationPriority(event: PropagationEvent) {
  return stageRank[inferredOrigin(event)];
}

export function orderPropagationEvents(events: readonly PropagationEvent[]) {
  return [...events].sort((left, right) => propagationPriority(left) - propagationPriority(right)
    || Date.parse(left.timestamp) - Date.parse(right.timestamp)
    || left.eventId.localeCompare(right.eventId));
}

export function createTrustedAutomationPropagation(input: {
  handle: (stage: PropagationStage, event: PropagationEvent) => Promise<void> | void;
  getCurrentEntityVersion?: (stage: PropagationStage, event: PropagationEvent) => Promise<string | null> | string | null;
}) {
  const completed = new Map<string, PropagationStageResult>();
  const highestPriorityByEntity = new Map<string, number>();

  async function propagate(value: unknown): Promise<PropagationResult> {
    const parsed = parseAutomationEventEnvelope(value);
    if (!parsed.success) return { kind: "SKIPPED", eventId: "invalid", reason: "INVALID_EVENT" };
    const event = value as PropagationEvent;
    const chain = propagationChainFor(event.eventType);
    if (!chain.length) return { kind: "SKIPPED", eventId: event.eventId, reason: "NO_CHAIN" };
    const entityKey = `${event.userId}:${event.entityType}:${event.entityId}`;
    const priority = propagationPriority(event);
    const previousPriority = highestPriorityByEntity.get(entityKey);
    if (previousPriority != null && priority > previousPriority) return { kind: "SKIPPED", eventId: event.eventId, reason: "PRIORITY_CONFLICT" };
    if (previousPriority == null || priority < previousPriority) highestPriorityByEntity.set(entityKey, priority);

    const stages: PropagationStageResult[] = [];
    for (const stage of chain) {
      const key = `${event.eventId}:${stage}`;
      const previous = completed.get(key);
      if (previous) {
        stages.push({ stage, kind: "REPLAYED" });
        continue;
      }
      if (input.getCurrentEntityVersion) {
        const current = await input.getCurrentEntityVersion(stage, event);
        if (current != null && current !== event.entityVersion) {
          const stale: PropagationStageResult = { stage, kind: "SKIPPED", reason: "STALE_DEPENDENCY" };
          completed.set(key, stale);
          stages.push(stale);
          continue;
        }
      }
      try {
        await input.handle(stage, event);
        const complete: PropagationStageResult = { stage, kind: "COMPLETED" };
        completed.set(key, complete);
        stages.push(complete);
      } catch {
        stages.push({ stage, kind: "FAILED", reason: "DEPENDENCY_FAILED" });
      }
    }
    return { kind: "PROPAGATED", eventId: event.eventId, stages };
  }

  async function propagateBatch(events: readonly PropagationEvent[]) {
    const results: PropagationResult[] = [];
    for (const event of orderPropagationEvents(events)) results.push(await propagate(event));
    return results;
  }

  return { propagate, propagateBatch };
}

export type TrustedAutomationPropagation = ReturnType<typeof createTrustedAutomationPropagation>;
