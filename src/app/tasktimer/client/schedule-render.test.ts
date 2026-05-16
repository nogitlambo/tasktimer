import { describe, expect, it } from "vitest";
import { buildTaskTimerScheduleGridHtml, getScheduleDaysForWeekStart, renderTaskTimerSchedulePage } from "./schedule-render";
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
    getOptimalProductivityDays: () => ["mon", "wed"],
  } as unknown) as Parameters<typeof buildTaskTimerScheduleGridHtml>[0];
}

function extractPlannerDayLabels(html: string) {
  return Array.from(html.matchAll(/<div class="schedulePlannerDayChip[^"]*" data-schedule-day="[^"]+">([^<]+)<\/div>/g)).map(
    (match) => match[1]
  );
}

function createFakeScheduleDayTab(day: string) {
  const classes = new Set<string>();
  const attributes = new Map<string, string>();

  return {
    dataset: { scheduleDay: day },
    classList: {
      contains: (className: string) => classes.has(className),
      toggle: (className: string, force?: boolean) => {
        const shouldAdd = force ?? !classes.has(className);
        if (shouldAdd) classes.add(className);
        else classes.delete(className);
        return shouldAdd;
      },
    },
    setAttribute: (name: string, value: string) => {
      attributes.set(name, value);
    },
    getAttribute: (name: string) => attributes.get(name) ?? null,
  };
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

  it("renders optimal productivity shading only on selected days", () => {
    const html = buildTaskTimerScheduleGridHtml(createScheduleRenderContext("sun"));

    expect(html.match(/scheduleProductivityHighlightBand/g)).toHaveLength(2);
  });

  it("highlights planner day chips for selected optimal productivity days", () => {
    const html = buildTaskTimerScheduleGridHtml(createScheduleRenderContext("sun"));

    expect(html).toContain('class="schedulePlannerDayChip isOptimalProductivityDay" data-schedule-day="mon"');
    expect(html).toContain('class="schedulePlannerDayChip isOptimalProductivityDay" data-schedule-day="wed"');
    expect(html).toContain('class="schedulePlannerDayChip" data-schedule-day="sun"');
  });

  it("highlights mobile day tabs for selected optimal productivity days", () => {
    const monTab = createFakeScheduleDayTab("mon");
    const tueTab = createFakeScheduleDayTab("tue");
    const wedTab = createFakeScheduleDayTab("wed");
    const ctx = createScheduleRenderContext("sun");
    ctx.els.scheduleGrid = { innerHTML: "", getBoundingClientRect: () => ({ width: 375 }) } as typeof ctx.els.scheduleGrid;
    ctx.els.scheduleMobileDayTabs = {
      querySelectorAll: () => [monTab, tueTab, wedTab],
    } as unknown as typeof ctx.els.scheduleMobileDayTabs;

    renderTaskTimerSchedulePage(ctx);

    expect(monTab.classList.contains("isOptimalProductivityDay")).toBe(true);
    expect(tueTab.classList.contains("isOptimalProductivityDay")).toBe(false);
    expect(wedTab.classList.contains("isOptimalProductivityDay")).toBe(true);
  });
});
