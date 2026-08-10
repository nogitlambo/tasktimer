import { z } from "zod";

import {
  AutomationEventTypeSchema,
  AutomationPrioritySchema,
  AutomationRuleTypeSchema,
  TRUSTED_AUTOMATION_SCHEMA_VERSION,
  type AutomationEventEnvelope,
  type AutomationPriority,
  type AutomationRuleType,
} from "./trustedAutomationContract";
import { parseAutomationEventEnvelope } from "./trustedAutomationContract";

export const AutomationTriggerRegistrationSchema = z.object({
  eventType: AutomationEventTypeSchema,
  ruleType: AutomationRuleTypeSchema,
  priority: AutomationPrioritySchema,
  schemaVersion: z.literal(TRUSTED_AUTOMATION_SCHEMA_VERSION),
}).strict();

export type AutomationTriggerRegistration = z.infer<typeof AutomationTriggerRegistrationSchema>;
export type AutomationDispatchRequest = AutomationEventEnvelope & {
  ruleType: AutomationRuleType;
  priority: AutomationPriority;
  idempotencyKey: string;
};

const priorityRank: Record<AutomationPriority, number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

export function createAutomationTriggerRegistry(registrations: readonly AutomationTriggerRegistration[] = []) {
  const parsed = registrations.map((registration) => AutomationTriggerRegistrationSchema.parse(registration));
  const byEvent = new Map<string, AutomationTriggerRegistration[]>();
  for (const registration of parsed) {
    const list = byEvent.get(registration.eventType) || [];
    if (!list.some((item) => item.ruleType === registration.ruleType)) list.push(registration);
    byEvent.set(registration.eventType, list);
  }
  return {
    get(eventType: AutomationTriggerRegistration["eventType"]) {
      return [...(byEvent.get(eventType) || [])].sort((left, right) => priorityRank[left.priority] - priorityRank[right.priority] || left.ruleType.localeCompare(right.ruleType));
    },
  };
}

type DispatchResult =
  | { kind: "DISPATCHED"; ruleType: AutomationRuleType }
  | { kind: "FAILED"; ruleType: AutomationRuleType; reason: "DISPATCH_FAILED" }
  | { kind: "SKIPPED"; reason: "UNSUPPORTED_EVENT" | "NO_REGISTERED_TRIGGER" | "STALE_EVENT" | "DUPLICATE_EVENT" };

export function createAutomationDispatcher(input: {
  registry: ReturnType<typeof createAutomationTriggerRegistry>;
  handle: (request: AutomationDispatchRequest) => Promise<void> | void;
  getCurrentEntityVersion?: (event: AutomationEventEnvelope) => Promise<string | null> | string | null;
}) {
  const processed = new Set<string>();

  return {
    async dispatch(value: unknown): Promise<DispatchResult[]> {
      const parsed = parseAutomationEventEnvelope(value);
      if (!parsed.success) return [{ kind: "SKIPPED", reason: "UNSUPPORTED_EVENT" }];
      const event = parsed.data;
      const registrations = input.registry.get(event.eventType);
      if (!registrations.length) return [{ kind: "SKIPPED", reason: "NO_REGISTERED_TRIGGER" }];
      if (input.getCurrentEntityVersion) {
        const currentVersion = await input.getCurrentEntityVersion(event);
        if (currentVersion != null && currentVersion !== event.entityVersion) return [{ kind: "SKIPPED", reason: "STALE_EVENT" }];
      }

      const results: DispatchResult[] = [];
      for (const registration of registrations) {
        const idempotencyKey = `${event.eventId}:${registration.ruleType}:${event.entityType}:${event.entityId}`;
        if (processed.has(idempotencyKey)) {
          results.push({ kind: "SKIPPED", reason: "DUPLICATE_EVENT" });
          continue;
        }
        processed.add(idempotencyKey);
        const request: AutomationDispatchRequest = {
          ...event,
          ruleType: registration.ruleType,
          priority: registration.priority,
          idempotencyKey,
        };
        try {
          await input.handle(request);
          results.push({ kind: "DISPATCHED", ruleType: registration.ruleType });
        } catch {
          results.push({ kind: "FAILED", ruleType: registration.ruleType, reason: "DISPATCH_FAILED" });
        }
      }
      return results;
    },
  };
}

export async function dispatchAutomationEvents(
  dispatcher: ReturnType<typeof createAutomationDispatcher>,
  events: readonly AutomationEventEnvelope[]
) {
  const ordered = [...events].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp) || left.eventId.localeCompare(right.eventId));
  const results: DispatchResult[][] = [];
  for (const event of ordered) results.push(await dispatcher.dispatch(event));
  return results;
}

export function parseAutomationTriggerRegistration(value: unknown) {
  const parsed = AutomationTriggerRegistrationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
