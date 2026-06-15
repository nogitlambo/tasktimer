import { describe, expect, it, vi } from "vitest";
import type { HistoryByTaskId, Task } from "../lib/types";
import { createTaskManualEntryInteraction } from "./task-manual-entry-interaction";

function classListStub() {
  const values = new Set<string>();
  return {
    toggle: (name: string, force?: boolean) => {
      const next = force ?? !values.has(name);
      if (next) values.add(name);
      else values.delete(name);
      return next;
    },
    contains: (name: string) => values.has(name),
  };
}

function elementStub(id = "") {
  const attributes = new Map<string, string>();
  return {
    id,
    dataset: {} as Record<string, string>,
    style: { display: "" },
    textContent: "",
    hidden: false,
    disabled: false,
    classList: classListStub(),
    setAttribute: vi.fn((name: string, value: string) => {
      attributes.set(name, value);
    }),
    getAttribute: vi.fn((name: string) => attributes.get(name) || null),
    querySelectorAll: vi.fn((selector: string): unknown[] => {
      void selector;
      return [];
    }),
    focus: vi.fn(),
    click: vi.fn(),
  };
}

function inputStub() {
  return {
    ...elementStub(),
    value: "",
    parentElement: elementStub(),
    showPicker: undefined as (() => void) | undefined,
  };
}

function createHarness(overrides?: {
  task?: Task | null;
  setTimeoutRef?: (handler: () => void, timeout: number) => unknown;
}) {
  const overlay = elementStub("taskManualEntryOverlay");
  const title = elementStub("taskManualEntryTitle");
  const meta = elementStub("taskManualEntryMeta");
  const dateTimeInput = inputStub();
  const dateTimeButton = elementStub("taskManualDateTimeBtn");
  const logTimeGoalToggle = elementStub("taskManualLogTimeGoalToggle");
  const elapsedField = elementStub("taskManualElapsedField");
  const hoursInput = inputStub();
  const minutesInput = inputStub();
  const noteInput = inputStub();
  const error = elementStub("taskManualEntryError");
  const opened: unknown[] = [];
  const closed: unknown[] = [];
  let historyByTaskId: HistoryByTaskId = {
    "other-task": [{ ts: 1000, name: "Other", ms: 60000 }],
  };
  const setHistoryByTaskId = vi.fn((nextHistory: HistoryByTaskId) => {
    historyByTaskId = nextHistory;
  });
  const saveHistory = vi.fn();
  const onManualEntrySaved = vi.fn();
  const syncSharedTaskSummariesForTask = vi.fn(() => Promise.resolve());
  const render = vi.fn();
  const task =
    overrides?.task === undefined
      ? ({
          id: "task-1",
          name: "Focus",
        } as Task)
      : overrides.task;
  const interaction = createTaskManualEntryInteraction({
    elements: {
      overlay: overlay as unknown as HTMLElement,
      title: title as unknown as HTMLElement,
      meta: meta as unknown as HTMLElement,
      dateTimeInput: dateTimeInput as unknown as HTMLInputElement,
      dateTimeButton: dateTimeButton as unknown as HTMLButtonElement,
      logTimeGoalToggle: logTimeGoalToggle as unknown as HTMLButtonElement,
      elapsedField: elapsedField as unknown as HTMLElement,
      hoursInput: hoursInput as unknown as HTMLInputElement,
      minutesInput: minutesInput as unknown as HTMLInputElement,
      noteInput: noteInput as unknown as HTMLInputElement,
      error: error as unknown as HTMLElement,
    },
    getTaskById: (taskId) => (task && taskId === "task-1" ? task : null),
    getTaskDisplayName: (entry) =>
      String(entry?.name || "").trim() || "Unnamed task",
    historyEntryColorForTaskMs: () => "#ff8a3d",
    nowMs: () => new Date("2026-05-03T04:05:00").getTime(),
    setTimeoutRef: overrides?.setTimeoutRef ?? ((handler) => handler()),
    openOverlay: (node) => opened.push(node),
    closeOverlay: (node) => closed.push(node),
    getHistoryByTaskId: () => historyByTaskId,
    setHistoryByTaskId,
    saveHistory,
    onManualEntrySaved,
    syncSharedTaskSummariesForTask,
    render,
  });
  return {
    interaction,
    overlay,
    title,
    meta,
    dateTimeInput,
    dateTimeButton,
    logTimeGoalToggle,
    elapsedField,
    hoursInput,
    minutesInput,
    noteInput,
    error,
    opened,
    closed,
    getHistoryByTaskId: () => historyByTaskId,
    setHistoryByTaskId,
    saveHistory,
    onManualEntrySaved,
    syncSharedTaskSummariesForTask,
    render,
  };
}

describe("createTaskManualEntryInteraction", () => {
  it("opens the overlay with task title, default draft, aria state, and focus", () => {
    const harness = createHarness();

    expect(harness.interaction.open("task-1")).toBe(true);

    expect(harness.interaction.getActiveTaskId()).toBe("task-1");
    expect(harness.title.textContent).toBe("Add Manual Entry for Focus");
    expect(harness.meta.textContent).toBe("");
    expect(harness.meta.hidden).toBe(true);
    expect(harness.dateTimeInput.value).toBe("2026-05-03T04:05");
    expect(
      harness.dateTimeInput.parentElement.setAttribute,
    ).toHaveBeenCalledWith("data-empty", "false");
    expect(harness.opened).toEqual([harness.overlay]);
    expect(harness.overlay.setAttribute).toHaveBeenCalledWith(
      "aria-hidden",
      "false",
    );
    expect(harness.dateTimeButton.focus).toHaveBeenCalledWith({
      preventScroll: true,
    });
  });

  it("does not open when the task cannot be found", () => {
    const harness = createHarness({ task: null });

    expect(harness.interaction.open("task-1")).toBe(false);

    expect(harness.opened).toEqual([]);
    expect(harness.interaction.getActiveTaskId()).toBeNull();
  });

  it("syncs draft input values and error state", () => {
    const harness = createHarness();
    harness.interaction.open("task-1");

    harness.interaction.setHoursValue("1");
    harness.interaction.setMinutesValue("25");
    harness.interaction.setNoteValue("Retrospective note");
    harness.interaction.setError("Elapsed time must be greater than 0.");

    expect(harness.hoursInput.value).toBe("1");
    expect(harness.minutesInput.value).toBe("25");
    expect(harness.noteInput.value).toBe("Retrospective note");
    expect(harness.error.textContent).toBe(
      "Elapsed time must be greater than 0.",
    );
    expect(harness.error.style.display).toBe("block");
  });

  it("opens a time-goal task with Log Time Goal checked and elapsed inputs hidden", () => {
    const harness = createHarness({
      task: {
        id: "task-1",
        name: "Focus",
        timeGoalEnabled: true,
        timeGoalMinutes: 90,
      } as Task,
    });

    expect(harness.interaction.open("task-1")).toBe(true);

    expect(harness.interaction.getDraft()?.logTimeGoal).toBe(true);
    expect(harness.interaction.getDraft()?.logTimeGoalAvailable).toBe(true);
    expect(harness.logTimeGoalToggle.disabled).toBe(false);
    expect(harness.logTimeGoalToggle.getAttribute("aria-disabled")).toBe(
      "false",
    );
    expect(harness.logTimeGoalToggle.getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(harness.logTimeGoalToggle.classList.contains("on")).toBe(true);
    expect(harness.elapsedField.hidden).toBe(true);
  });

  it("opens a no-goal task with Log Time Goal disabled and elapsed inputs visible", () => {
    const harness = createHarness({
      task: {
        id: "task-1",
        name: "Focus",
        timeGoalEnabled: false,
        timeGoalMinutes: 0,
      } as Task,
    });

    expect(harness.interaction.open("task-1")).toBe(true);

    expect(harness.interaction.getDraft()?.logTimeGoal).toBe(false);
    expect(harness.interaction.getDraft()?.logTimeGoalAvailable).toBe(false);
    expect(harness.logTimeGoalToggle.disabled).toBe(true);
    expect(harness.logTimeGoalToggle.getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect(harness.logTimeGoalToggle.getAttribute("aria-checked")).toBe(
      "false",
    );
    expect(harness.logTimeGoalToggle.classList.contains("on")).toBe(false);
    expect(harness.elapsedField.hidden).toBe(false);
  });

  it("clears validation errors when editable fields change", () => {
    const harness = createHarness();
    harness.interaction.open("task-1");
    harness.interaction.setError("Elapsed time must be greater than 0.");

    harness.interaction.setDateTimeValue("2026-05-03T06:30");

    expect(harness.interaction.getDraft()?.errorMessage).toBe("");
    expect(harness.dateTimeInput.value).toBe("2026-05-03T06:30");
    expect(harness.error.style.display).toBe("none");
  });

  it("saves checked Log Time Goal entries using the full task time goal", () => {
    const task = {
      id: "task-1",
      name: "Focus",
      color: "#21c7ff",
      timeGoalEnabled: true,
      timeGoalMinutes: 90,
    } as Task;
    const harness = createHarness({ task });
    harness.interaction.open("task-1");
    harness.interaction.setDateTimeValue("2026-05-03T06:30");
    harness.interaction.setNoteValue("Goal note");

    expect(harness.interaction.save()).toBe(true);

    const nextHistory = harness.getHistoryByTaskId();
    expect(nextHistory["task-1"]).toEqual([
      {
        ts: new Date("2026-05-03T06:30").getTime(),
        ms: 90 * 60 * 1000,
        name: "Focus",
        note: "Goal note",
        color: "#ff8a3d",
      },
    ]);
    expect(harness.onManualEntrySaved).toHaveBeenCalledWith({
      task,
      entry: {
        ts: new Date("2026-05-03T06:30").getTime(),
        ms: 90 * 60 * 1000,
        name: "Focus",
        note: "Goal note",
        color: "#ff8a3d",
      },
      historyByTaskId: nextHistory,
    });
  });

  it("reveals elapsed inputs and saves manual elapsed when Log Time Goal is turned off", () => {
    const harness = createHarness({
      task: {
        id: "task-1",
        name: "Focus",
        timeGoalEnabled: true,
        timeGoalMinutes: 90,
      } as Task,
    });
    harness.interaction.open("task-1");

    harness.interaction.setLogTimeGoalEnabled(false);
    harness.interaction.setHoursValue("0");
    harness.interaction.setMinutesValue("25");

    expect(harness.logTimeGoalToggle.getAttribute("aria-checked")).toBe(
      "false",
    );
    expect(harness.elapsedField.hidden).toBe(false);
    expect(harness.interaction.save()).toBe(true);
    expect(harness.getHistoryByTaskId()["task-1"]).toEqual([
      {
        ts: new Date("2026-05-03T04:05").getTime(),
        ms: 25 * 60 * 1000,
        name: "Focus",
        color: "#ff8a3d",
      },
    ]);
  });

  it("saves a valid draft by appending history, persisting, syncing shared summaries, closing, and rendering", () => {
    const harness = createHarness({
      task: { id: "task-1", name: "Focus", color: "#21c7ff" } as Task,
    });
    harness.interaction.open("task-1");
    harness.interaction.setDateTimeValue("2026-05-03T06:30");
    harness.interaction.setHoursValue("1");
    harness.interaction.setMinutesValue("25");
    harness.interaction.setNoteValue("Retrospective note");

    expect(harness.interaction.save()).toBe(true);

    const nextHistory = harness.getHistoryByTaskId();
    expect(nextHistory["other-task"]).toEqual([
      { ts: 1000, name: "Other", ms: 60000 },
    ]);
    expect(nextHistory["task-1"]).toEqual([
      {
        ts: new Date("2026-05-03T06:30").getTime(),
        ms: 85 * 60 * 1000,
        name: "Focus",
        note: "Retrospective note",
        color: "#ff8a3d",
      },
    ]);
    expect(harness.setHistoryByTaskId).toHaveBeenCalledWith(nextHistory);
    expect(harness.saveHistory).toHaveBeenCalledWith(nextHistory);
    expect(harness.onManualEntrySaved).toHaveBeenCalledWith({
      task: { id: "task-1", name: "Focus", color: "#21c7ff" },
      entry: {
        ts: new Date("2026-05-03T06:30").getTime(),
        ms: 85 * 60 * 1000,
        name: "Focus",
        note: "Retrospective note",
        color: "#ff8a3d",
      },
      historyByTaskId: nextHistory,
    });
    expect(harness.syncSharedTaskSummariesForTask).toHaveBeenCalledWith(
      "task-1",
    );
    expect(harness.interaction.getActiveTaskId()).toBeNull();
    expect(harness.closed).toEqual([harness.overlay]);
    expect(harness.render).toHaveBeenCalledTimes(1);
  });

  it("keeps invalid draft errors local and does not persist or close", () => {
    const harness = createHarness();
    harness.interaction.open("task-1");
    harness.interaction.setMinutesValue("0");

    expect(harness.interaction.save()).toBe(false);

    expect(harness.error.textContent).toBe(
      "Elapsed time must be greater than 0.",
    );
    expect(harness.error.style.display).toBe("block");
    expect(harness.setHistoryByTaskId).not.toHaveBeenCalled();
    expect(harness.saveHistory).not.toHaveBeenCalled();
    expect(harness.syncSharedTaskSummariesForTask).not.toHaveBeenCalled();
    expect(harness.closed).toEqual([]);
    expect(harness.render).not.toHaveBeenCalled();
  });

  it("resets draft and aria state on close", () => {
    const harness = createHarness();
    harness.interaction.open("task-1");
    harness.interaction.setHoursValue("2");

    harness.interaction.close();

    expect(harness.interaction.getActiveTaskId()).toBeNull();
    expect(harness.interaction.getDraft()).toBeNull();
    expect(harness.closed).toEqual([harness.overlay]);
    expect(harness.overlay.setAttribute).toHaveBeenLastCalledWith(
      "aria-hidden",
      "true",
    );
  });

  it("opens the native date picker when available", () => {
    const harness = createHarness();
    harness.dateTimeInput.showPicker = vi.fn();

    harness.interaction.openDateTimePicker();

    expect(harness.dateTimeInput.showPicker).toHaveBeenCalled();
    expect(harness.dateTimeInput.focus).not.toHaveBeenCalled();
  });

  it("falls back to focus and click when showPicker is unavailable", () => {
    const harness = createHarness();

    harness.interaction.openDateTimePicker();

    expect(harness.dateTimeInput.focus).toHaveBeenCalled();
    expect(harness.dateTimeInput.click).toHaveBeenCalled();
  });
});
