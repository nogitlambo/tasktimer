/// <reference types="vitest/globals" />

import {
  applyEditDraftToTask,
  buildTaskFromAddDraft,
  createDefaultAddTaskDraft,
  createEditTaskDraft,
  formatAddTaskDurationReadout,
  validateAddTaskDraft,
  validateAddTaskStep,
  validateEditTaskDraft,
} from "./taskConfig";
import { normalizeTask, type TaskTimerTask } from "./types";

function createTask(overrides: Partial<TaskTimerTask> = {}): TaskTimerTask {
  return normalizeTask({
    id: "task-1",
    name: "Deep Work",
    order: 1,
    accumulatedMs: 15 * 60 * 1000,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestoneTimeUnit: "hour",
    milestones: [],
    hasStarted: true,
    checkpointSoundEnabled: false,
    checkpointSoundMode: "once",
    checkpointToastEnabled: false,
    checkpointToastMode: "auto5s",
    timeGoalAction: "continue",
    presetIntervalsEnabled: false,
    presetIntervalValue: 0,
    presetIntervalLastMilestoneId: null,
    presetIntervalNextSeq: 1,
    mode: "mode1",
    ...overrides,
  } as TaskTimerTask);
}

describe("taskConfig helpers", () => {
  it("allows no-goal tasks through step 2 validation and readout formatting", () => {
    const draft = {
      ...createDefaultAddTaskDraft("mode1", "hour"),
      name: "Research",
      durationValue: "0",
      noTimeGoal: true,
    };

    expect(validateAddTaskStep(draft, 2)).toBeNull();
    expect(formatAddTaskDurationReadout(draft)).toBe("No time goal set");
  });

  it("hydrates edit drafts with sorted milestone values and preserved timer settings", () => {
    const task = createTask({
      milestonesEnabled: true,
      milestoneTimeUnit: "minute",
      milestones: [
        { id: "m2", createdSeq: 2, hours: 45, description: "Second" },
        { id: "m1", createdSeq: 1, hours: 15, description: "First" },
      ],
      checkpointSoundEnabled: true,
      checkpointSoundMode: "repeat",
      checkpointToastEnabled: true,
      checkpointToastMode: "manual",
      presetIntervalsEnabled: true,
      presetIntervalValue: 15,
      timeGoalAction: "resetLog",
    });

    const draft = createEditTaskDraft(task, 200_000);

    expect(draft.milestoneTimeUnit).toBe("minute");
    expect(draft.milestones.map((row) => row.value)).toEqual(["15", "45"]);
    expect(draft.checkpointSoundMode).toBe("repeat");
    expect(draft.checkpointToastMode).toBe("manual");
    expect(draft.timeGoalAction).toBe("resetLog");
  });

  it("rejects preset intervals that are not greater than zero", () => {
    const addDraft = {
      ...createDefaultAddTaskDraft("mode1", "hour"),
      name: "Planning",
      milestonesEnabled: true,
      milestones: [{ id: "m1", createdSeq: 1, value: "1", description: "" }],
      presetIntervalsEnabled: true,
      presetIntervalValue: "0",
    };

    expect(validateAddTaskDraft(addDraft)).toMatchObject({
      fields: { presetInterval: true },
    });

    const editDraft = {
      ...createEditTaskDraft(
        createTask({
          milestonesEnabled: true,
          milestones: [{ id: "m1", createdSeq: 1, hours: 1, description: "" }],
        }),
        200_000
      ),
      presetIntervalsEnabled: true,
      presetIntervalValue: "0",
    };

    expect(validateEditTaskDraft(editDraft)).toMatchObject({
      fields: { presetInterval: true },
    });
  });

  it("builds persisted tasks from add drafts and applies edit overrides without losing identity", () => {
    const addDraft = {
      ...createDefaultAddTaskDraft("mode2", "day"),
      name: "Design Review",
      milestonesEnabled: true,
      milestoneTimeUnit: "day" as const,
      milestones: [{ id: "m1", createdSeq: 1, value: "2", description: "Wrap" }],
      checkpointSoundEnabled: true,
      presetIntervalsEnabled: true,
      presetIntervalValue: "2",
      timeGoalAction: "resetNoLog" as const,
    };

    const built = buildTaskFromAddDraft(addDraft, [createTask()], () => "task-new");
    expect(built.id).toBe("task-new");
    expect(built.order).toBe(2);
    expect(built.mode).toBe("mode2");
    expect(built.milestones).toEqual([{ id: "m1", createdSeq: 1, hours: 2, description: "Wrap" }]);
    expect(built.timeGoalAction).toBe("resetNoLog");

    const baseTask = createTask({
      id: "keep-me",
      order: 7,
      accumulatedMs: 60_000,
      running: true,
      startMs: 500_000,
      presetIntervalLastMilestoneId: "legacy-ms",
      presetIntervalNextSeq: 8,
    });
    const editDraft = {
      ...createEditTaskDraft(baseTask, 800_000),
      name: "Updated Name",
      mode: "mode3" as const,
      milestonesEnabled: true,
      milestones: [{ id: "m9", createdSeq: 9, value: "3", description: "Finish" }],
      overrideElapsedEnabled: true,
      elapsedDays: "0",
      elapsedHours: "1",
      elapsedMinutes: "2",
      elapsedSeconds: "3",
    };

    const updated = applyEditDraftToTask(baseTask, editDraft, 900_000);
    expect(updated.id).toBe("keep-me");
    expect(updated.order).toBe(7);
    expect(updated.name).toBe("Updated Name");
    expect(updated.mode).toBe("mode3");
    expect(updated.accumulatedMs).toBe((1 * 3600 + 2 * 60 + 3) * 1000);
    expect(updated.startMs).toBe(900_000);
    expect(updated.xpDisqualifiedUntilReset).toBe(true);
    expect(updated.presetIntervalLastMilestoneId).toBe("legacy-ms");
    expect(updated.presetIntervalNextSeq).toBe(10);
  });
});
