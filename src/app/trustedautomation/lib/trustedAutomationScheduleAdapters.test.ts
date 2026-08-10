import { describe, expect, it, vi } from "vitest";

import type { RecoverySessionRepository } from "@/app/recovery/lib/recoverySessionRepository";
import type { ScheduleRepairRepository } from "@/app/schedulerepair/lib/scheduleRepairRepository";
import { createTrustedAutomationScheduleAdapters } from "./trustedAutomationScheduleAdapters";

const base = {
  uid: "uid-1",
  authenticatedUserId: "uid-1",
  entityVersion: "source-v1",
  currentEntityVersion: "source-v1",
  idempotencyKey: "8c9a2a31-d9b8-4f6d-a7d4-1a41d05a0001",
  nowMs: Date.parse("2026-08-09T09:00:00.000Z"),
};

describe("Trusted Automation Schedule Repair and Recovery adapters", () => {
  it("regenerates Schedule Repair proposals without applying task changes and replays duplicates", async () => {
    const generate = vi.fn().mockResolvedValue({ proposal: { id: "repair-2" }, outcome: { actions: [] }, reused: false });
    const repository = {
      loadSourceContext: vi.fn().mockResolvedValue({ tasks: [], futureDays: [], sourceTaskVersionHash: "source-v1" }),
      loadProposal: vi.fn(),
      saveProposal: vi.fn(),
      applyProposal: vi.fn(),
      undoProposal: vi.fn(),
    } as unknown as ScheduleRepairRepository;
    const adapters = createTrustedAutomationScheduleAdapters({ scheduleRepair: { repository, generate: generate as never } });
    const input = { ...base, entityId: "2026-08-09", localDate: "2026-08-09", action: "REGENERATE" as const };

    await expect(adapters.maintainScheduleRepair(input)).resolves.toMatchObject({ kind: "REFRESHED", referenceId: "repair-2", confirmationRequired: true });
    await expect(adapters.maintainScheduleRepair(input)).resolves.toMatchObject({ kind: "REPLAYED", referenceId: "repair-2" });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(repository.applyProposal).not.toHaveBeenCalled();
  });

  it("expires Schedule Repair through the owner repository and preserves explicit confirmation", async () => {
    const expireProposal = vi.fn().mockResolvedValue({ id: "repair-1", userId: "uid-1", status: "EXPIRED", sourceTaskVersionHash: "source-v1" });
    const repository = {
      loadSourceContext: vi.fn(),
      loadProposal: vi.fn().mockResolvedValue({ id: "repair-1", userId: "uid-1", sourceTaskVersionHash: "source-v1", status: "ACTIVE" }),
      expireProposal,
      saveProposal: vi.fn(),
      applyProposal: vi.fn(),
      undoProposal: vi.fn(),
    } as unknown as ScheduleRepairRepository;
    const adapters = createTrustedAutomationScheduleAdapters({ scheduleRepair: { repository } });

    await expect(adapters.maintainScheduleRepair({ ...base, entityId: "repair-1", repairId: "repair-1", action: "EXPIRE", localDate: "2026-08-09" })).resolves.toMatchObject({ kind: "REFRESHED", confirmationRequired: true });
    expect(expireProposal).toHaveBeenCalledWith("uid-1", "repair-1", base.nowMs);
    expect(repository.applyProposal).not.toHaveBeenCalled();
  });

  it("defers conflicting repair work and fails closed on stale proposal sources", async () => {
    const generate = vi.fn();
    const repository = {
      loadSourceContext: vi.fn().mockResolvedValue({ tasks: [], futureDays: [], sourceTaskVersionHash: "new-source" }),
      loadProposal: vi.fn(),
      saveProposal: vi.fn(),
      applyProposal: vi.fn(),
      undoProposal: vi.fn(),
    } as unknown as ScheduleRepairRepository;
    const adapters = createTrustedAutomationScheduleAdapters({ scheduleRepair: { repository, generate: generate as never } });

    await expect(adapters.maintainScheduleRepair({ ...base, entityId: "2026-08-09", localDate: "2026-08-09", action: "REGENERATE", conflict: true })).resolves.toMatchObject({ kind: "SKIPPED", reason: "CONFLICT_DEFERRED" });
    await expect(adapters.maintainScheduleRepair({ ...base, idempotencyKey: "8c9a2a31-d9b8-4f6d-a7d4-1a41d05a0002", entityId: "2026-08-09", localDate: "2026-08-09", action: "REGENERATE" })).resolves.toMatchObject({ kind: "SKIPPED", reason: "STALE_REFERENCE" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("creates and completes Recovery sessions through the existing lifecycle service", async () => {
    const session = { id: "recovery-1", userId: "uid-1", sourceTaskVersionHash: "recovery-v1", status: "ACTIVE" };
    const generate = vi.fn().mockResolvedValue({ session, reused: false });
    const sessionRepository = {
      loadSession: vi.fn().mockResolvedValue(session),
      saveSession: vi.fn(),
      completeSession: vi.fn().mockResolvedValue({ ...session, status: "COMPLETED" }),
      expireSession: vi.fn().mockResolvedValue({ ...session, status: "EXPIRED" }),
      dismissSession: vi.fn(),
    } as unknown as RecoverySessionRepository;
    const adapters = createTrustedAutomationScheduleAdapters({ recovery: { sessionRepository, generate: generate as never } });

    await expect(adapters.maintainRecovery({ ...base, entityId: "recovery-1", sessionId: "recovery-1", entityVersion: "recovery-v1", currentEntityVersion: "recovery-v1", action: "CREATE", localDate: "2026-08-09", timezone: "UTC", triggerCodes: ["USER_REQUESTED_RECOVERY"] })).resolves.toMatchObject({ kind: "REFRESHED", adapter: "RECOVERY_MODE", referenceId: "recovery-1", confirmationRequired: true });
    await expect(adapters.maintainRecovery({ ...base, idempotencyKey: "8c9a2a31-d9b8-4f6d-a7d4-1a41d05a0003", entityId: "recovery-1", sessionId: "recovery-1", entityVersion: "recovery-v1", currentEntityVersion: "recovery-v1", action: "COMPLETE", localDate: "2026-08-09", timezone: "UTC", triggerCodes: ["USER_REQUESTED_RECOVERY"] })).resolves.toMatchObject({ kind: "REFRESHED", confirmationRequired: true });
    expect(sessionRepository.completeSession).toHaveBeenCalledWith("uid-1", "recovery-1", base.nowMs);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
