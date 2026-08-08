import { describe, expect, it, vi } from "vitest";

import { generateScheduleRepairProposal } from "./scheduleRepairService";
import type { ScheduleRepairRepository } from "./scheduleRepairRepository";

function repository(): ScheduleRepairRepository {
  return {
    loadSourceContext: vi.fn().mockResolvedValue({
      tasks: [{ id: "task-1", taskVersion: "version-1", estimatedMinutes: 80, completedMinutes: 0, plannedDate: "2026-08-08", flexible: true, priority: "low", active: true, completed: false, editable: true, ownerUid: "uid-1" }],
      futureDays: [{ date: "2026-08-09", plannedMinutes: 0, capacityMax: 60 }],
      sourceTaskVersionHash: "b".repeat(64),
    }),
    loadProposal: vi.fn(),
    saveProposal: vi.fn().mockResolvedValue(undefined),
    applyProposal: vi.fn(),
    undoProposal: vi.fn(),
  };
}

describe("Schedule Repair proposal service", () => {
  it("persists only a structured user-owned proposal", async () => {
    const repo = repository();
    const result = await generateScheduleRepairProposal({
      uid: "uid-1", localDate: "2026-08-08", nowMs: Date.parse("2026-08-08T09:00:00.000Z"), repository: repo,
      capacityLoader: vi.fn().mockResolvedValue({ snapshot: { id: "capacity-1", fullDayRange: { min: 45, max: 100 }, remainingRange: { min: 30, max: 60 }, state: "STANDARD", confidence: "HIGH", primarySource: "DEFAULT", manualOverride: null } }),
    });
    expect(result.proposal).toMatchObject({ userId: "uid-1", localDate: "2026-08-08", status: "ACTIVE", capacitySnapshotId: "capacity-1" });
    expect(result.proposal?.actions[0]).toMatchObject({ taskId: "task-1", type: "MOVE_TO_LATER_DAY" });
    expect(repo.saveProposal).toHaveBeenCalledWith("uid-1", expect.objectContaining({ sourceTaskVersionHash: "b".repeat(64) }));
  });

  it("uses a product fallback when capacity loading fails", async () => {
    const repo = repository();
    const result = await generateScheduleRepairProposal({ uid: "uid-1", localDate: "2026-08-08", nowMs: Date.parse("2026-08-08T09:00:00.000Z"), repository: repo, capacityLoader: vi.fn().mockRejectedValue(new Error("capacity unavailable")) });
    expect(result.proposal?.remainingCapacity).toEqual({ min: 45, max: 60 });
  });

  it("does not persist a proposal when no safe actions exist", async () => {
    const repo = repository();
    (repo.loadSourceContext as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ tasks: [{ id: "unknown", estimatedMinutes: null, completedMinutes: 0, active: true, completed: false, editable: true }], futureDays: [], sourceTaskVersionHash: "c".repeat(64) });
    const result = await generateScheduleRepairProposal({ uid: "uid-1", localDate: "2026-08-08", nowMs: Date.parse("2026-08-08T09:00:00.000Z"), repository: repo });
    expect(result.proposal).toBeNull();
    expect(repo.saveProposal).not.toHaveBeenCalled();
  });
});
