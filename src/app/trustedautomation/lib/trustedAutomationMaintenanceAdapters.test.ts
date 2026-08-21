import { describe, expect, it, vi } from "vitest";

import type { BrainDumpReviewSession, BrainDumpSessionStore } from "@/app/brain-dump/lib/brainDumpProcessing";
import type { TaskClarificationAIProvider, TaskClarificationResponse } from "@/app/taskclarification/lib/taskClarification";
import type { TaskClarificationRepository } from "@/app/taskclarification/lib/taskClarificationRepository";
import { createTrustedAutomationMaintenanceAdapters, getBrainDumpMaintenanceSessionVersion } from "./trustedAutomationMaintenanceAdapters";

const nowMs = Date.parse("2026-08-09T09:00:00.000Z");

function session(overrides: Partial<BrainDumpReviewSession> = {}): BrainDumpReviewSession {
  return {
    id: "dump-1",
    ownerUid: "uid-1",
    mode: "typed",
    state: "review",
    promptId: "brain-dump-v1",
    createdAtMs: nowMs - 1000,
    expiresAtMs: nowMs + 60_000,
    source: { kind: "typed", rawText: "Prepare the launch checklist." },
    review: {
      selectedCount: 1,
      items: [{
        id: "item-1",
        itemType: "task",
        title: "Prepare the launch checklist",
        selected: true,
        sourceEvidence: ["launch checklist"],
        confidence: 0.9,
        ambiguityFlags: [],
        supported: true,
        date: {
          originalDateText: null,
          dateSource: "none",
          timezone: "UTC",
          resolvedDate: null,
          dateConfidence: 0,
          ambiguity: "none",
          ambiguityFlags: [],
          userConfirmedDate: false,
          recurrenceText: null,
          dependencyTimingText: null,
        },
        enrichment: {
          notes: null,
          estimatedDurationMinutes: 30,
          timeGoalValue: 30,
          timeGoalUnit: "minute",
          timeGoalPeriod: "day",
          priority: "high",
          firstAction: "Open the checklist.",
        },
        validationErrors: [],
        duplicateWarnings: [],
        duplicateDecision: "undecided",
      }],
    },
    ...overrides,
  };
}

const clarificationResponse = {
  suggestedTitle: "Prepare the launch checklist",
  definitionOfDone: "Checklist is reviewed and shared.",
  firstAction: "Open the checklist.",
  stoppingPoint: "Stop after the checklist is ready for review.",
  estimatedMinutes: 30,
  estimatedRange: { min: 20, max: 40 },
  subtasks: [{ title: "Review checklist", estimatedMinutes: 20 }],
  clarificationQuestions: [],
  warnings: [],
  reasonCodes: ["VAGUE"],
  confidence: "HIGH",
  ambiguityScore: 0.1,
  initiationDifficultyScore: 0.2,
} as unknown as TaskClarificationResponse;

const base = {
  uid: "uid-1",
  authenticatedUserId: "uid-1",
  idempotencyKey: "c4e6c5f7-10c0-42e1-9c75-2a9e6f657b01",
  nowMs,
};

describe("Trusted Automation maintenance adapters", () => {
  it("expires an owned Brain Dump session through the existing redaction workflow", async () => {
    const current = session();
    const store: BrainDumpSessionStore = { getSession: vi.fn().mockResolvedValue(current), saveSession: vi.fn().mockResolvedValue(undefined) };
    const adapters = createTrustedAutomationMaintenanceAdapters({ brainDump: { store } });
    const input = { ...base, entityId: current.id, entityVersion: getBrainDumpMaintenanceSessionVersion(current), currentEntityVersion: getBrainDumpMaintenanceSessionVersion(current), action: "EXPIRE" as const };

    await expect(adapters.maintainBrainDump(input)).resolves.toMatchObject({ kind: "REFRESHED", adapter: "BRAIN_DUMP" });
    expect(store.saveSession).toHaveBeenCalledWith(expect.objectContaining({ state: "expired", source: expect.objectContaining({ rawText: "" }) }));
    expect(JSON.stringify(await adapters.maintainBrainDump({ ...input, idempotencyKey: "c4e6c5f7-10c0-42e1-9c75-2a9e6f657b02" }))).not.toContain("Prepare the launch checklist.");
  });

  it("regenerates a pending Brain Dump through the provider contract and replays duplicates", async () => {
    const current = session();
    const store: BrainDumpSessionStore = { getSession: vi.fn().mockResolvedValue(current), saveSession: vi.fn().mockResolvedValue(undefined) };
    const process = vi.fn().mockResolvedValue({ ...current, id: "dump-2", createdAtMs: nowMs, expiresAtMs: nowMs + 60_000 });
    const adapters = createTrustedAutomationMaintenanceAdapters({ brainDump: { store, process: process as never, provider: {} as never } });
    const input = { ...base, entityId: current.id, entityVersion: getBrainDumpMaintenanceSessionVersion(current), currentEntityVersion: getBrainDumpMaintenanceSessionVersion(current), action: "REGENERATE" as const };

    await expect(adapters.maintainBrainDump(input)).resolves.toMatchObject({ kind: "REFRESHED", referenceId: "dump-2" });
    await expect(adapters.maintainBrainDump(input)).resolves.toMatchObject({ kind: "REPLAYED", referenceId: "dump-2" });
    expect(process).toHaveBeenCalledTimes(1);
    expect(process).toHaveBeenCalledWith(expect.objectContaining({ uid: "uid-1", text: "Prepare the launch checklist." }));
  });

  it("fails closed for stale or cross-user Brain Dump references", async () => {
    const current = session();
    const store: BrainDumpSessionStore = { getSession: vi.fn().mockResolvedValue(current), saveSession: vi.fn() };
    const adapters = createTrustedAutomationMaintenanceAdapters({ brainDump: { store } });
    const version = getBrainDumpMaintenanceSessionVersion(current);

    await expect(adapters.maintainBrainDump({ ...base, authenticatedUserId: "other", entityId: current.id, entityVersion: version, currentEntityVersion: version, action: "EXPIRE" })).resolves.toMatchObject({ kind: "SKIPPED", reason: "OWNERSHIP_FAILED" });
    await expect(adapters.maintainBrainDump({ ...base, idempotencyKey: "c4e6c5f7-10c0-42e1-9c75-2a9e6f657b03", entityId: current.id, entityVersion: "old", currentEntityVersion: "old", action: "EXPIRE" })).resolves.toMatchObject({ kind: "SKIPPED", reason: "STALE_REFERENCE" });
    expect(store.saveSession).not.toHaveBeenCalled();
  });

  it("requests Task Clarification through its existing task/version and persistence contracts", async () => {
    const task = { taskId: "task-1", title: "Prepare launch", taskType: "once-off" as const, sourceTaskVersion: "task-v1" };
    const saveRecommendation = vi.fn().mockResolvedValue(undefined);
    const repository = { loadTask: vi.fn().mockResolvedValue(task), saveRecommendation } as unknown as TaskClarificationRepository;
    const generate = vi.fn().mockResolvedValue(clarificationResponse);
    const provider = {} as TaskClarificationAIProvider;
    const adapters = createTrustedAutomationMaintenanceAdapters({ taskClarification: { repository, generate: generate as never, provider, createId: () => "clarification-1", modelVersion: "test-model" } });
    const input = { ...base, entityId: "task-1", entityVersion: "task-v1", currentEntityVersion: "task-v1", timezone: "UTC" };

    const result = await adapters.requestTaskClarification(input);
    expect(result).toMatchObject({ kind: "REFRESHED", adapter: "TASK_CLARIFICATION", sourceVersion: "task-v1", referenceId: "clarification-1" });
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ taskId: "task-1", title: "Prepare launch" }), "Prepare launch", provider);
    expect(saveRecommendation).toHaveBeenCalledWith("uid-1", expect.objectContaining({ id: "clarification-1", userId: "uid-1", sourceTaskVersion: "task-v1" }));
  });

  it("does not invoke Task Clarification when the task version is stale or the dependency fails", async () => {
    const repository = { loadTask: vi.fn().mockResolvedValue({ taskId: "task-1", title: "Prepare launch", sourceTaskVersion: "new-version" }), saveRecommendation: vi.fn() } as unknown as TaskClarificationRepository;
    const generate = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    const adapters = createTrustedAutomationMaintenanceAdapters({ taskClarification: { repository, generate: generate as never, provider: {} as never } });
    const input = { ...base, entityId: "task-1", entityVersion: "old-version", currentEntityVersion: "old-version", timezone: "UTC" };

    await expect(adapters.requestTaskClarification(input)).resolves.toMatchObject({ kind: "SKIPPED", reason: "STALE_REFERENCE" });
    expect(generate).not.toHaveBeenCalled();
    (repository.loadTask as ReturnType<typeof vi.fn>).mockResolvedValue({ taskId: "task-1", title: "Prepare launch", sourceTaskVersion: "old-version" });
    await expect(adapters.requestTaskClarification({ ...input, idempotencyKey: "c4e6c5f7-10c0-42e1-9c75-2a9e6f657b04" })).resolves.toMatchObject({ kind: "FAILED", reason: "DEPENDENCY_UNAVAILABLE" });
  });
});
