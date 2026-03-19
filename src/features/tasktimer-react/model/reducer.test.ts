/// <reference types="vitest/globals" />

import { createHistoryEntryKey } from "./selectors";
import { createReducerInitialState, reduceTaskTimerState } from "./reducer";
import { createDefaultAddTaskDraft } from "./taskConfig";
import { createEmptySnapshot, normalizeTask, type TaskTimerSnapshot, type TaskTimerState, type TaskTimerTask } from "./types";

function createTask(overrides: Partial<TaskTimerTask> = {}): TaskTimerTask {
  return normalizeTask({
    id: "task-1",
    name: "Base Task",
    order: 1,
    accumulatedMs: 45_000,
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

function hydrateState(snapshotOverrides: Partial<TaskTimerSnapshot> = {}, nowMs = 1_000_000): TaskTimerState {
  return reduceTaskTimerState(createReducerInitialState(nowMs), {
    type: "hydrate",
    nowMs,
    snapshot: {
      ...createEmptySnapshot(),
      ...snapshotOverrides,
    },
  });
}

describe("task timer reducer", () => {
  it("blocks add-task wizard advancement when the current step is invalid", () => {
    const opened = reduceTaskTimerState(hydrateState(), { type: "openAddTask" });
    const blocked = reduceTaskTimerState(opened, { type: "advanceAddTaskWizard" });

    expect(blocked.addTaskWizardStep).toBe(1);
    expect(blocked.addTaskValidation).toMatchObject({
      fields: { name: true },
    });
  });

  it("resets add-task draft and wizard state when the dialog closes", () => {
    let state = reduceTaskTimerState(hydrateState(), { type: "openAddTask" });
    state = reduceTaskTimerState(state, {
      type: "patchAddTaskDraft",
      patch: {
        name: "Prototype",
        milestonesEnabled: true,
        milestones: [{ id: "m1", createdSeq: 1, value: "2", description: "Ship" }],
      },
    });
    state = reduceTaskTimerState(state, { type: "setAddTaskWizardStep", step: 3 });

    const closed = reduceTaskTimerState(state, { type: "closeAddTask" });

    expect(closed.addTaskDialogOpen).toBe(false);
    expect(closed.addTaskWizardStep).toBe(1);
    expect(closed.addTaskDraft).toEqual(createDefaultAddTaskDraft("mode1", "hour"));
    expect(closed.addTaskValidation).toBeNull();
  });

  it("submits a valid add-task draft into persisted task state", () => {
    let state = reduceTaskTimerState(hydrateState(), { type: "openAddTask" });
    state = reduceTaskTimerState(state, {
      type: "patchAddTaskDraft",
      patch: {
        name: "Ship Feature",
        milestonesEnabled: true,
        milestoneTimeUnit: "minute",
        milestones: [{ id: "m1", createdSeq: 1, value: "30", description: "Halfway" }],
        checkpointSoundEnabled: true,
        presetIntervalsEnabled: true,
        presetIntervalValue: "30",
        timeGoalAction: "resetLog",
      },
    });

    const submitted = reduceTaskTimerState(state, { type: "submitAddTask" });
    const created = submitted.tasks[0];

    expect(submitted.tasks).toHaveLength(1);
    expect(submitted.addTaskDialogOpen).toBe(false);
    expect(created.name).toBe("Ship Feature");
    expect(created.milestonesEnabled).toBe(true);
    expect(created.milestoneTimeUnit).toBe("minute");
    expect(created.milestones).toEqual([{ id: "m1", createdSeq: 1, hours: 30, description: "Halfway" }]);
    expect(created.timeGoalAction).toBe("resetLog");
    expect(submitted.recentCustomTaskNames).toContain("Ship Feature");
  });

  it("hydrates the edit draft from an existing task and saves config changes without losing runtime fields", () => {
    const baseTask = createTask({
      id: "task-99",
      order: 4,
      accumulatedMs: 120_000,
      running: true,
      startMs: 400_000,
      hasStarted: true,
      presetIntervalLastMilestoneId: "persist-me",
      presetIntervalNextSeq: 4,
      milestonesEnabled: true,
      milestones: [{ id: "m1", createdSeq: 1, hours: 2, description: "First" }],
    });
    let state = hydrateState({ tasks: [baseTask] }, 900_000);

    state = reduceTaskTimerState(state, { type: "openEditTask", taskId: "task-99" });
    expect(state.editTaskDraft.taskId).toBe("task-99");
    expect(state.editTaskDraft.name).toBe("Base Task");
    expect(state.editTaskDraft.milestones.map((row) => row.value)).toEqual(["2"]);

    state = reduceTaskTimerState(state, {
      type: "patchEditTaskDraft",
      patch: {
        name: "Renamed Task",
        mode: "mode3",
        milestoneTimeUnit: "day",
        milestones: [{ id: "m2", createdSeq: 2, value: "5", description: "Wrap" }],
        checkpointToastEnabled: true,
      },
    });

    const saved = reduceTaskTimerState(state, { type: "saveEditTask", nowMs: 950_000 });
    const updated = saved.tasks[0];

    expect(updated.id).toBe("task-99");
    expect(updated.order).toBe(4);
    expect(updated.running).toBe(true);
    expect(updated.startMs).toBe(400_000);
    expect(updated.accumulatedMs).toBe(120_000);
    expect(updated.name).toBe("Renamed Task");
    expect(updated.mode).toBe("mode3");
    expect(updated.milestoneTimeUnit).toBe("day");
    expect(updated.milestones).toEqual([{ id: "m2", createdSeq: 2, hours: 5, description: "Wrap" }]);
    expect(updated.presetIntervalLastMilestoneId).toBe("persist-me");
    expect(updated.presetIntervalNextSeq).toBe(4);
  });

  it("requires confirmation before enabling elapsed override and then applies it", () => {
    let state = hydrateState({ tasks: [createTask()] });
    state = reduceTaskTimerState(state, { type: "openEditTask", taskId: "task-1" });

    const requested = reduceTaskTimerState(state, { type: "requestEnableEditElapsedOverride" });
    expect(requested.confirmDialog).toMatchObject({ kind: "enableElapsedOverride" });
    expect(requested.editTaskDraft.overrideElapsedEnabled).toBe(false);

    const confirmed = reduceTaskTimerState(requested, { type: "confirmDialog" });
    expect(confirmed.confirmDialog).toBeNull();
    expect(confirmed.editTaskDraft.overrideElapsedEnabled).toBe(true);
  });

  it("deletes a task while preserving history when the confirm checkbox is cleared", () => {
    const task = createTask({ id: "task-delete" });
    const entry = { ts: 100, name: "Base Task", ms: 45_000 };
    const hydrated = hydrateState({
      tasks: [task],
      historyByTaskId: { "task-delete": [entry] },
      pinnedHistoryTaskIds: ["task-delete"],
    });
    const state = {
      ...hydrated,
      openHistoryTaskIds: ["task-delete"],
      historySelectionByTaskId: { "task-delete": [createHistoryEntryKey(entry)] },
    };

    const requested = reduceTaskTimerState(state, { type: "requestDeleteTask", taskId: "task-delete" });
    expect(requested.confirmDialog).toMatchObject({ kind: "deleteTask", taskId: "task-delete" });

    const confirmed = reduceTaskTimerState(requested, { type: "confirmDialog", checkboxChecked: false });
    expect(confirmed.tasks).toHaveLength(0);
    expect(confirmed.historyByTaskId["task-delete"]).toEqual([entry]);
    expect(confirmed.deletedTaskMeta["task-delete"]).toMatchObject({ name: "Base Task" });
    expect(confirmed.openHistoryTaskIds).toEqual([]);
    expect(confirmed.pinnedHistoryTaskIds).toEqual([]);
    expect(confirmed.historySelectionByTaskId["task-delete"]).toBeUndefined();
  });

  it("resets a task and logs the elapsed session when requested", () => {
    const task = createTask({
      id: "task-reset",
      accumulatedMs: 90_000,
      hasStarted: true,
      xpDisqualifiedUntilReset: true,
    });
    const state = hydrateState({ tasks: [task] }, 2_000_000);

    const requested = reduceTaskTimerState(state, { type: "requestResetTask", taskId: "task-reset" });
    expect(requested.confirmDialog).toMatchObject({ kind: "resetTask", taskId: "task-reset" });

    const confirmed = reduceTaskTimerState(requested, { type: "confirmDialog", checkboxChecked: true });
    expect(confirmed.tasks[0]).toMatchObject({
      id: "task-reset",
      accumulatedMs: 0,
      running: false,
      startMs: null,
      hasStarted: false,
      xpDisqualifiedUntilReset: false,
    });
    expect(confirmed.historyByTaskId["task-reset"]).toHaveLength(1);
    expect(confirmed.historyByTaskId["task-reset"][0]).toMatchObject({
      name: "Base Task",
      ms: 90_000,
    });
  });

  it("deletes the selected history entries after confirmation and clears the selection", () => {
    const first = { ts: 100, name: "Base Task", ms: 10_000 };
    const second = { ts: 200, name: "Base Task", ms: 20_000 };
    const hydrated = hydrateState({
      tasks: [createTask({ id: "task-history" })],
      historyByTaskId: { "task-history": [first, second] },
    });

    let state = reduceTaskTimerState(hydrated, {
      type: "toggleHistorySelection",
      taskId: "task-history",
      entryKey: createHistoryEntryKey(first),
    });
    state = reduceTaskTimerState(state, { type: "requestDeleteHistorySelection", taskId: "task-history" });
    expect(state.confirmDialog).toMatchObject({ kind: "deleteHistoryEntries", taskId: "task-history" });

    const confirmed = reduceTaskTimerState(state, { type: "confirmDialog" });
    expect(confirmed.historyByTaskId["task-history"]).toEqual([second]);
    expect(confirmed.historySelectionByTaskId["task-history"]).toEqual([]);
    expect(confirmed.confirmDialog).toBeNull();
  });
});
