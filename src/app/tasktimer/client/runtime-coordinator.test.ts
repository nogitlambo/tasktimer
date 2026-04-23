import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { createTaskTimerMutableStore } from "./mutable-store";
const mocks = vi.hoisted(() => ({
  renderTaskTimerSchedulePage: vi.fn(),
}));

vi.mock("./schedule-render", () => ({
  renderTaskTimerSchedulePage: mocks.renderTaskTimerSchedulePage,
}));

import {
  createTaskTimerRuntimeCoordinator,
  resolveScheduleOpenFocus,
  resolveScheduleOpenScrollTargetMinutes,
} from "./runtime-coordinator";
import type { TaskTimerScheduleState } from "./schedule-runtime";
import { SCHEDULE_MINUTE_PX } from "./schedule-runtime";

function makeScheduleState() {
  return createTaskTimerMutableStore<TaskTimerScheduleState>({
    selectedDay: "mon",
    dragTaskId: null,
    dragSourceDay: null,
    dragPreviewDay: null,
    dragPreviewStartMinutes: null,
    dragPointerOffsetMinutes: 0,
  });
}

describe("runtime-coordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T10:00:00.000Z"));
    mocks.renderTaskTimerSchedulePage.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("prefers the earliest scheduled task on the current day when opening schedule", () => {
    expect(
      resolveScheduleOpenScrollTargetMinutes({
        presentDay: "mon",
        viewModel: {
          scheduled: [
            { day: "tue", startMinutes: 480, durationMinutes: 60, task: {} as any },
            { day: "mon", startMinutes: 540, durationMinutes: 60, task: {} as any },
            { day: "mon", startMinutes: 660, durationMinutes: 60, task: {} as any },
          ],
        },
        optimalProductivityStartTime: "14:00",
        optimalProductivityEndTime: "15:00",
      })
    ).toBe(540);
  });

  it("falls back to the configured productivity start time when the day has no scheduled tasks", () => {
    expect(
      resolveScheduleOpenScrollTargetMinutes({
        presentDay: "mon",
        viewModel: {
          scheduled: [{ day: "tue", startMinutes: 480, durationMinutes: 60, task: {} as any }],
        },
        optimalProductivityStartTime: "14:00",
        optimalProductivityEndTime: "15:00",
      })
    ).toBe(8 * 60);
  });

  it("uses the configured productivity start time for overnight fallback windows", () => {
    expect(
      resolveScheduleOpenScrollTargetMinutes({
        presentDay: "mon",
        viewModel: { scheduled: [] },
        optimalProductivityStartTime: "22:00",
        optimalProductivityEndTime: "02:00",
      })
    ).toBe(22 * 60);
  });

  it("focuses the earliest scheduled task overall when the current day has none", () => {
    expect(
      resolveScheduleOpenFocus({
        presentDay: "mon",
        viewModel: {
          scheduled: [
            { day: "tue", startMinutes: 480, durationMinutes: 60, task: {} as any },
            { day: "wed", startMinutes: 540, durationMinutes: 60, task: {} as any },
          ],
        },
      })
    ).toEqual({
      day: "tue",
      startMinutes: 480,
    });
  });

  it("sets the first scheduled day and scroll target when a schedule-open scroll is pending", () => {
    const scheduleState = makeScheduleState();
    const scroller = { scrollTop: 0 } as HTMLElement;
    const buildViewModel = vi.fn(() => ({
      scheduled: [{ day: "tue", startMinutes: 510, durationMinutes: 60, task: {} as any }],
      unscheduled: [],
    }));
    const renderTasksPage = vi.fn();
    const coordinator = createTaskTimerRuntimeCoordinator({
      els: {
        scheduleGridScroller: scroller,
        scheduleGrid: { innerHTML: "" } as HTMLElement,
        scheduleTrayList: { innerHTML: "" } as HTMLElement,
        scheduleMobileDayTabs: null,
      } as any,
      scheduleState,
      scheduleRuntime: { buildViewModel },
      escapeHtmlUI: (value: unknown) => String(value ?? ""),
      getOptimalProductivityStartTime: () => "09:00",
      getOptimalProductivityEndTime: () => "17:00",
      renderTasksPage,
      getCloudSyncApi: () => null,
      pendingPushActionKey: "pending",
      getTasks: () => [],
      startTaskByIndex: vi.fn(),
      jumpToTaskById: vi.fn(),
      maybeRestorePendingTimeGoalFlow: vi.fn(),
      applyAppPage: vi.fn(),
      navigateToAppRoute: vi.fn(),
      checkpointRepeatActiveTaskId: () => null,
      stopCheckpointRepeatAlert: vi.fn(),
      getHistoryInlineApi: () => null,
      windowRef: {
        requestAnimationFrame: (callback: FrameRequestCallback) => {
          callback(0);
          return 1;
        },
      } as Window,
      getCurrentUid: () => null,
      getCurrentEmail: () => null,
      architectEmail: "architect@example.com",
    });

    coordinator.requestScheduleEntryScroll();
    coordinator.renderSchedulePage();

    expect(scheduleState.get("selectedDay")).toBe("tue");
    expect(buildViewModel).toHaveBeenCalledTimes(1);
    expect(scroller.scrollTop).toBe(Math.max(0, 510 * SCHEDULE_MINUTE_PX));
  });

  it("keeps the schedule-open snap pending until scheduled entries exist", () => {
    const scheduleState = makeScheduleState();
    const scroller = { scrollTop: 0 } as HTMLElement;
    const buildViewModel = vi
      .fn()
      .mockReturnValueOnce({ scheduled: [], unscheduled: [] })
      .mockReturnValueOnce({ scheduled: [{ day: "wed", startMinutes: 600, durationMinutes: 60, task: {} as any }], unscheduled: [] });
    const coordinator = createTaskTimerRuntimeCoordinator({
      els: {
        scheduleGridScroller: scroller,
        scheduleGrid: { innerHTML: "" } as HTMLElement,
        scheduleTrayList: { innerHTML: "" } as HTMLElement,
        scheduleMobileDayTabs: null,
      } as any,
      scheduleState,
      scheduleRuntime: { buildViewModel },
      escapeHtmlUI: (value: unknown) => String(value ?? ""),
      getOptimalProductivityStartTime: () => "09:00",
      getOptimalProductivityEndTime: () => "17:00",
      renderTasksPage: vi.fn(),
      getCloudSyncApi: () => null,
      pendingPushActionKey: "pending",
      getTasks: () => [],
      startTaskByIndex: vi.fn(),
      jumpToTaskById: vi.fn(),
      maybeRestorePendingTimeGoalFlow: vi.fn(),
      applyAppPage: vi.fn(),
      navigateToAppRoute: vi.fn(),
      checkpointRepeatActiveTaskId: () => null,
      stopCheckpointRepeatAlert: vi.fn(),
      getHistoryInlineApi: () => null,
      windowRef: {
        requestAnimationFrame: (callback: FrameRequestCallback) => {
          callback(0);
          return 1;
        },
      } as Window,
      getCurrentUid: () => null,
      getCurrentEmail: () => null,
      architectEmail: "architect@example.com",
    });

    coordinator.requestScheduleEntryScroll();
    coordinator.renderSchedulePage();
    expect(scroller.scrollTop).toBe(0);

    coordinator.renderSchedulePage();
    expect(scheduleState.get("selectedDay")).toBe("wed");
    expect(scroller.scrollTop).toBe(Math.max(0, 600 * SCHEDULE_MINUTE_PX));
  });
});
