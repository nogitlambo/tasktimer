import { describe, expect, it, vi } from "vitest";

import {
  createAutomationDispatcher,
  createAutomationTriggerRegistry,
  dispatchAutomationEvents,
} from "./trustedAutomationDispatcher";

const event = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1 as const,
  eventId: "event-1",
  eventType: "DAILY_BRIEF_STALE" as const,
  entityType: "DAILY_BRIEF" as const,
  entityId: "brief-1",
  entityVersion: "v1",
  userId: "user-1",
  timestamp: "2026-08-09T00:00:00.000Z",
  ...overrides,
});

describe("Trusted Automation dispatcher", () => {
  it("registers supported event-to-rule mappings and rejects unknown rules", () => {
    const registry = createAutomationTriggerRegistry([
      { eventType: "DAILY_BRIEF_STALE", ruleType: "REFRESH_DAILY_BRIEF", priority: "NORMAL", schemaVersion: 1 },
      { eventType: "CAPACITY_UPDATED", ruleType: "REFRESH_CAPACITY_SNAPSHOT", priority: "HIGH", schemaVersion: 1 },
    ]);

    expect(registry.get("DAILY_BRIEF_STALE")).toMatchObject([{ ruleType: "REFRESH_DAILY_BRIEF" }]);
    expect(() => createAutomationTriggerRegistry([{ eventType: "DAILY_BRIEF_STALE", ruleType: "DELETE_TASK" as never, priority: "LOW", schemaVersion: 1 }])).toThrow();
  });

  it("orders dispatches deterministically, carries ownership/version context, and suppresses duplicates", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const registry = createAutomationTriggerRegistry([
      { eventType: "DAILY_BRIEF_STALE", ruleType: "REFRESH_DAILY_BRIEF", priority: "NORMAL", schemaVersion: 1 },
      { eventType: "DAILY_BRIEF_STALE", ruleType: "REFRESH_CAPACITY_SNAPSHOT", priority: "HIGH", schemaVersion: 1 },
    ]);
    const dispatcher = createAutomationDispatcher({ registry, handle: handler });

    const results = await dispatcher.dispatch(event());
    await dispatcher.dispatch(event());

    expect(results.filter((result) => result.kind === "DISPATCHED").map((result) => result.ruleType)).toEqual(["REFRESH_CAPACITY_SNAPSHOT", "REFRESH_DAILY_BRIEF"]);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", entityVersion: "v1", eventId: "event-1" }));
  });

  it("skips stale and unsupported events without invoking the handler", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const dispatcher = createAutomationDispatcher({
      registry: createAutomationTriggerRegistry([{ eventType: "DAILY_BRIEF_STALE", ruleType: "REFRESH_DAILY_BRIEF", priority: "NORMAL", schemaVersion: 1 }]),
      handle: handler,
      getCurrentEntityVersion: vi.fn().mockResolvedValue("v2"),
    });

    const stale = await dispatcher.dispatch(event());
    const unsupported = await dispatcher.dispatch(event({ eventId: "event-2", eventType: "TASK_UPDATED", entityType: "TASK", entityId: "task-1" }));

    expect(stale).toEqual([{ kind: "SKIPPED", reason: "STALE_EVENT" }]);
    expect(unsupported).toEqual([{ kind: "SKIPPED", reason: "NO_REGISTERED_TRIGGER" }]);
    expect(handler).not.toHaveBeenCalled();
  });

  it("isolates handler failure so later registered rules still dispatch", async () => {
    const handler = vi.fn()
      .mockRejectedValueOnce(new Error("one adapter failed"))
      .mockResolvedValueOnce(undefined);
    const dispatcher = createAutomationDispatcher({
      registry: createAutomationTriggerRegistry([
        { eventType: "DAILY_BRIEF_STALE", ruleType: "REFRESH_DAILY_BRIEF", priority: "HIGH", schemaVersion: 1 },
        { eventType: "DAILY_BRIEF_STALE", ruleType: "REFRESH_NEXT_BEST_ACTION", priority: "NORMAL", schemaVersion: 1 },
      ]),
      handle: handler,
    });

    const results = await dispatcher.dispatch(event());

    expect(results).toEqual([
      { kind: "FAILED", ruleType: "REFRESH_DAILY_BRIEF", reason: "DISPATCH_FAILED" },
      { kind: "DISPATCHED", ruleType: "REFRESH_NEXT_BEST_ACTION" },
    ]);
  });

  it("sorts a batch by timestamp and event id before dispatching", async () => {
    const seen: string[] = [];
    const dispatcher = createAutomationDispatcher({
      registry: createAutomationTriggerRegistry([{ eventType: "DAILY_BRIEF_STALE", ruleType: "REFRESH_DAILY_BRIEF", priority: "NORMAL", schemaVersion: 1 }]),
      handle: vi.fn(async (request) => { seen.push(request.eventId); }),
    });

    await dispatchAutomationEvents(dispatcher, [
      event({ eventId: "event-b", timestamp: "2026-08-09T00:00:02.000Z" }),
      event({ eventId: "event-a", timestamp: "2026-08-09T00:00:01.000Z" }),
    ]);

    expect(seen).toEqual(["event-a", "event-b"]);
  });
});
