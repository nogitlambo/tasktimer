import { describe, expect, it } from "vitest";
import { buildTaskTimerScheduleGridHtml, getScheduleDaysForWeekStart } from "./schedule-render";
import { createTaskTimerMutableStore } from "./mutable-store";
import type { TaskTimerScheduleState } from "./schedule-runtime";

function createScheduleRenderContext(weekStarting: "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat") {
  const state = createTaskTimerMutableStore<TaskTimerScheduleState>({
    selectedDay: "mon",
    dragTaskId: null,
    dragSourceDay: null,
    dragPreviewDay: null,
    dragPreviewStartMinutes: null,
    dragPointerOffsetMinutes: 0,
  });

  return ({
    els: {
      scheduleGrid: {
        getBoundingClientRect: () => ({ width: 1600 }),
      },
      scheduleTrayList: null,
      scheduleMobileDayTabs: null,
    },
    state,
    scheduleRuntime: {
      getVisibleDays: () => ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      buildViewModel: () => ({ scheduled: [], unscheduled: [] }),
      getDragPreview: () => null,
    },
    escapeHtmlUI: (value: unknown) => String(value ?? ""),
    getWeekStarting: () => weekStarting,
    getOptimalProductivityStartTime: () => "09:00",
    getOptimalProductivityEndTime: () => "17:00",
  } as unknown) as Parameters<typeof buildTaskTimerScheduleGridHtml>[0];
}

function extractPlannerDayLabels(html: string) {
  return Array.from(html.matchAll(/<div class="schedulePlannerDayChip">([^<]+)<\/div>/g)).map((match) => match[1]);
}

describe("schedule render", () => {
  it("orders desktop schedule days from the selected week start", () => {
    expect(getScheduleDaysForWeekStart("sun")).toEqual(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
    expect(getScheduleDaysForWeekStart("wed")).toEqual(["wed", "thu", "fri", "sat", "sun", "mon", "tue"]);
  });

  it("renders desktop planner headers from the selected week start", () => {
    const html = buildTaskTimerScheduleGridHtml(createScheduleRenderContext("sun"));

    expect(extractPlannerDayLabels(html)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });
});
