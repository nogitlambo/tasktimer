import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryByTaskId, Task } from "../lib/types";
import type { TaskTimerImportExportContext } from "./context";
import { createTaskTimerImportExport } from "./import-export";
import { createTaskTimerSharedTask } from "./task-shared";

type ImportExportHarness = {
  api: ReturnType<typeof createTaskTimerImportExport>;
  getTasks: () => Task[];
  setTasks: (value: Task[]) => void;
  getDownloads: () => Blob[];
};

function installBrowserDownloadStubs() {
  const downloads: Blob[] = [];

  vi.stubGlobal("URL", {
    createObjectURL: vi.fn((blob: Blob) => {
      downloads.push(blob);
      return `blob:task-export-${downloads.length}`;
    }),
    revokeObjectURL: vi.fn(),
  });

  vi.stubGlobal("document", {
    createElement: vi.fn(() => ({
      href: "",
      download: "",
      click: vi.fn(),
      remove: vi.fn(),
    })),
    body: {
      appendChild: vi.fn(),
    },
  });

  vi.stubGlobal("window", {
    setTimeout: (callback: () => void) => {
      callback();
      return 0;
    },
  });

  return downloads;
}

function installFileReaderStub() {
  vi.stubGlobal(
    "FileReader",
    class {
      result = "";
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;

      readAsText(file: { text: () => Promise<string> }) {
        file
          .text()
          .then((text) => {
            this.result = text;
            this.onload?.();
          })
          .catch(() => {
            this.onerror?.();
          });
      }
    }
  );
  vi.stubGlobal("alert", vi.fn());
}

function makeHarness(initialTasks: Task[] = [], initialHistory: HistoryByTaskId = {}): ImportExportHarness {
  let idSeq = 0;
  let tasks = initialTasks;
  let history = initialHistory;
  const sharedTasks = createTaskTimerSharedTask({
    createId: () => `generated-${++idSeq}`,
  });

  const ctx: TaskTimerImportExportContext = {
    els: {} as TaskTimerImportExportContext["els"],
    on: vi.fn() as unknown as TaskTimerImportExportContext["on"],
    getTasks: () => tasks,
    setTasks: (value) => {
      tasks = value;
    },
    getHistoryByTaskId: () => history,
    setHistoryByTaskId: (value) => {
      history = value;
    },
    getExportTaskIndex: () => null,
    setExportTaskIndex: vi.fn(),
    openOverlay: vi.fn(),
    closeOverlay: vi.fn(),
    confirm: vi.fn(),
    closeConfirm: vi.fn(),
    save: vi.fn(),
    saveHistory: vi.fn(),
    render: vi.fn(),
    createId: sharedTasks.createId,
    makeTask: sharedTasks.makeTask,
    sortMilestones: (milestones) => milestones.slice().sort((a, b) => Number(a.hours || 0) - Number(b.hours || 0)),
    ensureMilestoneIdentity: sharedTasks.ensureMilestoneIdentity,
    getPresetIntervalValueNum: sharedTasks.getPresetIntervalValueNum,
    getPresetIntervalNextSeqNum: sharedTasks.getPresetIntervalNextSeqNum,
    cleanupHistory: (value) => value,
    hasEntitlement: () => true,
    getCurrentPlan: () => "pro",
    showUpgradePrompt: vi.fn(),
  };

  return {
    api: createTaskTimerImportExport(ctx),
    getTasks: () => tasks,
    setTasks: (value) => {
      tasks = value;
    },
    getDownloads: () => (globalThis.URL.createObjectURL as unknown as { mock: { calls: Array<[Blob]> } }).mock.calls.map(([blob]) => blob),
  };
}

function makeConfiguredTask(): Task {
  const sharedTasks = createTaskTimerSharedTask({ createId: () => "local-id" });
  const task = sharedTasks.makeTask("Deep Work", 7);
  Object.assign(task, {
    id: "task-1",
    color: "#c9ff24",
    createdAtMs: 1_700_000_000_000,
    accumulatedMs: 45_000,
    running: true,
    startMs: 1_700_000_010_000,
    collapsed: true,
    hasStarted: true,
    taskType: "once-off",
    onceOffDay: "fri",
    onceOffTargetDate: "2999-01-01",
    plannedStartDay: "fri",
    plannedStartTime: "09:30",
    plannedStartByDay: { fri: "09:30" },
    plannedStartOpenEnded: false,
    plannedStartPushRemindersEnabled: false,
    milestonesEnabled: true,
    milestoneTimeUnit: "minute",
    milestones: [
      { id: "m2", createdSeq: 2, hours: 30, description: "Second", alertsEnabled: false },
      { id: "m1", createdSeq: 1, hours: 10, description: "First", alertsEnabled: true },
    ],
    checkpointSoundEnabled: true,
    checkpointSoundMode: "repeat",
    checkpointToastEnabled: true,
    checkpointToastMode: "manual",
    presetIntervalsEnabled: true,
    presetIntervalValue: 15,
    presetIntervalLastMilestoneId: "m2",
    presetIntervalNextSeq: 3,
    timeGoalEnabled: true,
    timeGoalValue: 90,
    timeGoalUnit: "minute",
    timeGoalPeriod: "day",
    timeGoalMinutes: 90,
  });
  (task as Task & { xpDisqualifiedUntilReset?: boolean }).xpDisqualifiedUntilReset = true;
  return task;
}

async function readLatestPayload(harness: ImportExportHarness) {
  const downloads = harness.getDownloads();
  const latest = downloads[downloads.length - 1];
  expect(latest).toBeInstanceOf(Blob);
  return JSON.parse(await latest.text()) as { tasks: Array<Record<string, unknown>>; [key: string]: unknown };
}

async function importPayload(harness: ImportExportHarness, payload: unknown) {
  harness.api.importBackupFromFile({
    text: async () => JSON.stringify(payload),
  } as unknown as File);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("createTaskTimerImportExport task settings round-trip", () => {
  beforeEach(() => {
    installBrowserDownloadStubs();
    installFileReaderStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exports explicit task settings for single-task and backup exports", async () => {
    const task = makeConfiguredTask();
    const harness = makeHarness([task], { "task-1": [{ ts: 1, ms: 1000, name: "Deep Work" }] });

    harness.api.exportTask(0, { includeHistory: true });
    const singleTaskPayload = await readLatestPayload(harness);
    const singleTask = singleTaskPayload.tasks[0]!;

    expect(singleTask).toMatchObject({
      id: "task-1",
      name: "Deep Work",
      color: "#c9ff24",
      accumulatedMs: 45_000,
      running: false,
      startMs: null,
      collapsed: true,
      hasStarted: true,
      taskType: "once-off",
      onceOffDay: "fri",
      onceOffTargetDate: "2999-01-01",
      plannedStartDay: "fri",
      plannedStartTime: "09:30",
      plannedStartByDay: { fri: "09:30" },
      plannedStartPushRemindersEnabled: false,
      milestonesEnabled: true,
      milestoneTimeUnit: "minute",
      checkpointSoundEnabled: true,
      checkpointSoundMode: "repeat",
      checkpointToastEnabled: true,
      checkpointToastMode: "manual",
      presetIntervalsEnabled: true,
      presetIntervalValue: 15,
      presetIntervalLastMilestoneId: "m2",
      presetIntervalNextSeq: 3,
      timeGoalEnabled: true,
      timeGoalValue: 90,
      timeGoalUnit: "minute",
      timeGoalPeriod: "day",
      timeGoalMinutes: 90,
    });
    expect(singleTask).not.toHaveProperty("xpDisqualifiedUntilReset");
    expect(singleTask.milestones).toEqual([
      { id: "m1", createdSeq: 1, hours: 10, description: "First", alertsEnabled: true },
      { id: "m2", createdSeq: 2, hours: 30, description: "Second", alertsEnabled: false },
    ]);
    expect(singleTaskPayload.history).toEqual({ "task-1": [{ ts: 1, ms: 1000, name: "Deep Work" }] });

    harness.api.exportBackup();
    const backupPayload = await readLatestPayload(harness);
    expect(backupPayload.planAtExport).toBe("pro");
    expect(backupPayload.tasks[0]).toMatchObject({
      id: "task-1",
      taskType: "once-off",
      timeGoalEnabled: true,
      plannedStartByDay: { fri: "09:30" },
      presetIntervalsEnabled: true,
    });
  });

  it("imports exported task settings while sanitizing live runtime state", async () => {
    const harness = makeHarness();

    await importPayload(harness, {
      schema: "taskticka_backup_v1",
      tasks: [
        {
          ...makeConfiguredTask(),
          running: true,
          startMs: 12345,
        },
      ],
      history: {},
    });

    const importedTask = harness.getTasks()[0]!;
    expect(importedTask).toMatchObject({
      id: "task-1",
      name: "Deep Work",
      color: "#c9ff24",
      accumulatedMs: 45_000,
      running: false,
      startMs: null,
      collapsed: true,
      hasStarted: true,
      taskType: "once-off",
      onceOffDay: "fri",
      onceOffTargetDate: "2999-01-01",
      plannedStartDay: "fri",
      plannedStartTime: "09:30",
      plannedStartByDay: { fri: "09:30" },
      plannedStartPushRemindersEnabled: false,
      milestonesEnabled: true,
      milestoneTimeUnit: "minute",
      checkpointSoundEnabled: true,
      checkpointSoundMode: "repeat",
      checkpointToastEnabled: true,
      checkpointToastMode: "manual",
      presetIntervalsEnabled: true,
      presetIntervalValue: 15,
      presetIntervalLastMilestoneId: "m2",
      presetIntervalNextSeq: 3,
      timeGoalEnabled: true,
      timeGoalValue: 90,
      timeGoalUnit: "minute",
      timeGoalPeriod: "day",
      timeGoalMinutes: 90,
    });
    expect(importedTask.milestones).toEqual([
      { id: "m1", createdSeq: 1, hours: 10, description: "First", alertsEnabled: true },
      { id: "m2", createdSeq: 2, hours: 30, description: "Second", alertsEnabled: false },
    ]);
  });

  it("imports legacy minimal tasks with defaults", async () => {
    const harness = makeHarness();

    await importPayload(harness, {
      schema: "taskticka_backup_v1",
      tasks: [{ name: "Legacy Task" }],
      history: {},
    });

    expect(harness.getTasks()[0]).toMatchObject({
      name: "Legacy Task",
      taskType: "recurring",
      accumulatedMs: 0,
      running: false,
      startMs: null,
      milestonesEnabled: false,
      milestones: [],
      checkpointSoundEnabled: false,
      checkpointSoundMode: "once",
      checkpointToastEnabled: true,
      checkpointToastMode: "auto5s",
      presetIntervalsEnabled: false,
      presetIntervalValue: 0,
      presetIntervalLastMilestoneId: null,
      presetIntervalNextSeq: 1,
      timeGoalEnabled: false,
      timeGoalValue: 0,
      timeGoalUnit: "hour",
      timeGoalPeriod: "week",
      timeGoalMinutes: 0,
      plannedStartDay: null,
      plannedStartTime: null,
      plannedStartByDay: null,
      plannedStartPushRemindersEnabled: true,
    });
  });
});
