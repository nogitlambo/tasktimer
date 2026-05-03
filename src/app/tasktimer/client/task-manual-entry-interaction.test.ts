import { describe, expect, it, vi } from "vitest";
import type { Task } from "../lib/types";
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

function createHarness(overrides?: { task?: Task | null; setTimeoutRef?: (handler: () => void, timeout: number) => unknown }) {
  const overlay = elementStub("taskManualEntryOverlay");
  const title = elementStub("taskManualEntryTitle");
  const meta = elementStub("taskManualEntryMeta");
  const dateTimeInput = inputStub();
  const dateTimeButton = elementStub("taskManualDateTimeBtn");
  const hoursInput = inputStub();
  const minutesInput = inputStub();
  const noteInput = inputStub();
  const error = elementStub("taskManualEntryError");
  const easyButton = elementStub();
  easyButton.dataset.completionDifficulty = "4";
  const hardButton = elementStub();
  hardButton.dataset.completionDifficulty = "2";
  const difficultyGroup = elementStub("taskManualEntryDifficultyGroup");
  difficultyGroup.querySelectorAll.mockImplementation((selector: string) => {
    if (selector === "[data-completion-difficulty]") return [easyButton, hardButton];
    return [];
  });
  const opened: unknown[] = [];
  const closed: unknown[] = [];
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
      hoursInput: hoursInput as unknown as HTMLInputElement,
      minutesInput: minutesInput as unknown as HTMLInputElement,
      difficultyGroup: difficultyGroup as unknown as HTMLElement,
      noteInput: noteInput as unknown as HTMLInputElement,
      error: error as unknown as HTMLElement,
    },
    getTaskById: (taskId) => (task && taskId === "task-1" ? task : null),
    getTaskDisplayName: (entry) => String(entry?.name || "").trim() || "Unnamed task",
    nowMs: () => new Date("2026-05-03T04:05:00").getTime(),
    setTimeoutRef: overrides?.setTimeoutRef ?? ((handler) => handler()),
    openOverlay: (node) => opened.push(node),
    closeOverlay: (node) => closed.push(node),
  });
  return {
    interaction,
    overlay,
    title,
    meta,
    dateTimeInput,
    dateTimeButton,
    hoursInput,
    minutesInput,
    noteInput,
    error,
    easyButton,
    hardButton,
    opened,
    closed,
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
    expect(harness.dateTimeInput.parentElement.setAttribute).toHaveBeenCalledWith("data-empty", "false");
    expect(harness.opened).toEqual([harness.overlay]);
    expect(harness.overlay.setAttribute).toHaveBeenCalledWith("aria-hidden", "false");
    expect(harness.dateTimeButton.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("does not open when the task cannot be found", () => {
    const harness = createHarness({ task: null });

    expect(harness.interaction.open("task-1")).toBe(false);

    expect(harness.opened).toEqual([]);
    expect(harness.interaction.getActiveTaskId()).toBeNull();
  });

  it("syncs draft input values, selected difficulty, and error state", () => {
    const harness = createHarness();
    harness.interaction.open("task-1");

    harness.interaction.setHoursValue("1");
    harness.interaction.setMinutesValue("25");
    harness.interaction.setNoteValue("Retrospective note");
    harness.interaction.selectDifficulty("2");
    harness.interaction.setError("Elapsed time must be greater than 0.");

    expect(harness.hoursInput.value).toBe("1");
    expect(harness.minutesInput.value).toBe("25");
    expect(harness.noteInput.value).toBe("Retrospective note");
    expect(harness.easyButton.classList.contains("is-selected")).toBe(false);
    expect(harness.easyButton.setAttribute).toHaveBeenLastCalledWith("aria-checked", "false");
    expect(harness.hardButton.classList.contains("is-selected")).toBe(true);
    expect(harness.hardButton.setAttribute).toHaveBeenLastCalledWith("aria-checked", "true");
    expect(harness.error.textContent).toBe("Elapsed time must be greater than 0.");
    expect(harness.error.style.display).toBe("block");
  });

  it("clears validation errors when editable fields change", () => {
    const harness = createHarness();
    harness.interaction.open("task-1");
    harness.interaction.setError("Choose a sentiment before saving this entry.");

    harness.interaction.setDateTimeValue("2026-05-03T06:30");

    expect(harness.interaction.getDraft()?.errorMessage).toBe("");
    expect(harness.dateTimeInput.value).toBe("2026-05-03T06:30");
    expect(harness.error.style.display).toBe("none");
  });

  it("resets draft and aria state on close", () => {
    const harness = createHarness();
    harness.interaction.open("task-1");
    harness.interaction.setHoursValue("2");

    harness.interaction.close();

    expect(harness.interaction.getActiveTaskId()).toBeNull();
    expect(harness.interaction.getDraft()).toBeNull();
    expect(harness.closed).toEqual([harness.overlay]);
    expect(harness.overlay.setAttribute).toHaveBeenLastCalledWith("aria-hidden", "true");
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
