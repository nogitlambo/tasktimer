import { describe, expect, it, vi } from "vitest";

import { createTrustedAutomationPropagation, orderPropagationEvents, propagationChainFor } from "./trustedAutomationPropagation";

function event(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1 as const,
    eventId: "event-1",
    eventType: "TASK_UPDATED" as const,
    entityType: "TASK" as const,
    entityId: "task-1",
    entityVersion: "version-1",
    userId: "uid-1",
    timestamp: "2026-08-09T09:00:00.000Z",
    ...overrides,
  };
}

describe("Trusted Automation cross-feature propagation", () => {
  it("defines deterministic dependency order for task changes", () => {
    expect(propagationChainFor("TASK_COMPLETED")).toEqual(["CAPACITY_SNAPSHOT", "DAILY_BRIEF", "NEXT_BEST_ACTION", "SCHEDULE_REPAIR", "RECOVERY_MODE"]);
    expect(propagationChainFor("RECOVERY_COMPLETED")).toEqual(["CAPACITY_SNAPSHOT", "DAILY_BRIEF", "NEXT_BEST_ACTION", "SCHEDULE_REPAIR"]);
  });

  it("runs earlier successful stages when a later dependency fails", async () => {
    const seen: string[] = [];
    const propagation = createTrustedAutomationPropagation({
      handle: vi.fn(async (stage) => {
        seen.push(stage);
        if (stage === "NEXT_BEST_ACTION") throw new Error("NBA unavailable");
      }),
    });

    const result = await propagation.propagate(event());

    expect(seen).toEqual(["CAPACITY_SNAPSHOT", "DAILY_BRIEF", "NEXT_BEST_ACTION", "SCHEDULE_REPAIR", "RECOVERY_MODE"]);
    expect(result).toMatchObject({ kind: "PROPAGATED", stages: [
      { stage: "CAPACITY_SNAPSHOT", kind: "COMPLETED" },
      { stage: "DAILY_BRIEF", kind: "COMPLETED" },
      { stage: "NEXT_BEST_ACTION", kind: "FAILED" },
      { stage: "SCHEDULE_REPAIR", kind: "COMPLETED" },
      { stage: "RECOVERY_MODE", kind: "COMPLETED" },
    ] });
  });

  it("rejects stale stages and replays duplicate propagation idempotently", async () => {
    const handle = vi.fn();
    const propagation = createTrustedAutomationPropagation({
      handle,
      getCurrentEntityVersion: vi.fn(async (stage) => stage === "DAILY_BRIEF" ? "newer-version" : "version-1"),
    });

    const first = await propagation.propagate(event());
    const second = await propagation.propagate(event());

    expect(first).toMatchObject({ kind: "PROPAGATED", stages: [
      { stage: "CAPACITY_SNAPSHOT", kind: "COMPLETED" },
      { stage: "DAILY_BRIEF", kind: "SKIPPED", reason: "STALE_DEPENDENCY" },
      { stage: "NEXT_BEST_ACTION", kind: "COMPLETED" },
      { stage: "SCHEDULE_REPAIR", kind: "COMPLETED" },
      { stage: "RECOVERY_MODE", kind: "COMPLETED" },
    ] });
    expect(second).toMatchObject({ kind: "PROPAGATED", stages: [
      { stage: "CAPACITY_SNAPSHOT", kind: "REPLAYED" },
      { stage: "DAILY_BRIEF", kind: "REPLAYED" },
      { stage: "NEXT_BEST_ACTION", kind: "REPLAYED" },
      { stage: "SCHEDULE_REPAIR", kind: "REPLAYED" },
      { stage: "RECOVERY_MODE", kind: "REPLAYED" },
    ] });
    expect(handle).toHaveBeenCalledTimes(4);
  });

  it("lets explicit user events outrank recovery, schedule repair, and background events", async () => {
    const order: string[] = [];
    const propagation = createTrustedAutomationPropagation({ handle: vi.fn(async (_stage, item) => { order.push(item.eventId); }) });
    const results = await propagation.propagateBatch([
      event({ eventId: "background", origin: "BACKGROUND", timestamp: "2026-08-09T09:00:00.000Z" }),
      event({ eventId: "recovery", origin: "RECOVERY", timestamp: "2026-08-09T09:00:01.000Z" }),
      event({ eventId: "user", origin: "USER", timestamp: "2026-08-09T09:00:02.000Z" }),
    ]);

    expect(order[0]).toBe("user");
    expect(results[0]).toMatchObject({ eventId: "user", kind: "PROPAGATED" });
    expect(results[1]).toMatchObject({ eventId: "recovery", kind: "SKIPPED", reason: "PRIORITY_CONFLICT" });
    expect(results[2]).toMatchObject({ eventId: "background", kind: "SKIPPED", reason: "PRIORITY_CONFLICT" });
  });

  it("orders same-priority events by timestamp and then event id", () => {
    const ordered = orderPropagationEvents([
      event({ eventId: "b", timestamp: "2026-08-09T09:00:02.000Z" }),
      event({ eventId: "z", timestamp: "2026-08-09T09:00:01.000Z" }),
      event({ eventId: "a", timestamp: "2026-08-09T09:00:01.000Z" }),
    ]);
    expect(ordered.map((item) => item.eventId)).toEqual(["a", "z", "b"]);
  });
});
