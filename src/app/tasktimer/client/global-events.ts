/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Task } from "../lib/types";

type ScheduleDay = Task["plannedStartDay"];
type NonNullScheduleDay = NonNullable<ScheduleDay>;

type RegisterScheduleEventsOptions = {
  on: (target: EventTarget | null | undefined, event: string, handler: (event: unknown) => void) => void;
  documentRef: Document;
  scheduleMinutePx: number;
  isScheduleMobileLayout: () => boolean;
  normalizeScheduleDay: (raw: unknown) => ScheduleDay;
  tasks: () => Task[];
  isScheduleRenderableTask: (task: Task) => boolean;
  isRecurringDailyScheduleTask: (task: Task) => boolean;
  formatScheduleDayLabel: (day: NonNullScheduleDay) => string;
  save: () => void;
  render: () => void;
  setScheduleSelectedDay: (day: NonNullScheduleDay) => void;
  renderSchedulePage: () => void;
  setScheduleDragTaskId: (taskId: string | null) => void;
  setScheduleDragSourceDay: (day: NonNullScheduleDay | null) => void;
  getScheduleDragTaskId: () => string | null;
  clearScheduleDragPreview: () => void;
  setScheduleDragPointerOffsetMinutes: (value: number) => void;
  resolveScheduleDropStartMinutes: (dropZone: HTMLElement, clientY: unknown) => number;
  getScheduleDragPreviewDay: () => NonNullScheduleDay | null;
  getScheduleDragPreviewStartMinutes: () => number | null;
  setScheduleDragPreview: (day: NonNullScheduleDay, startMinutes: number) => void;
  currentAppPage: () => string;
  moveTaskOnSchedule: (taskId: string, day: NonNullScheduleDay, startMinutes: number, sourceDay?: NonNullScheduleDay | null) => void;
  getScheduleDragSourceDay: () => NonNullScheduleDay | null;
  toggleTaskScheduleFlexible: (taskId: string) => { status: "missing" | "noop" | "updated"; flexible?: boolean };
};

type RegisterWindowRuntimeEventsOptions = {
  on: (target: EventTarget | null | undefined, event: string, handler: (event: unknown) => void) => void;
  windowRef: Window;
  runtimeDestroyed: () => boolean;
  pendingPushEvent: string;
  maybeHandlePendingTaskJump: () => void;
  maybeHandlePendingPushAction: () => void;
  rehydrateFromCloudAndRender: (opts?: { force?: boolean }) => Promise<unknown>;
  maybeRestorePendingTimeGoalFlow: () => void;
  flushPendingCloudWrites: () => Promise<unknown>;
};

type RegisterDashboardShellEventsOptions = {
  on: (target: EventTarget | null | undefined, event: string, handler: (event: unknown) => void) => void;
  dashboardRefreshBtn: EventTarget | null | undefined;
  dashboardHeatSummaryCloseBtn: EventTarget | null | undefined;
  isDashboardBusy: () => boolean;
  dashboardMenuFlipped: () => boolean;
  setDashboardRefreshPending: (value: boolean) => void;
  rehydrateFromCloudAndRender: (opts?: { force?: boolean }) => Promise<unknown>;
  closeDashboardHeatSummaryCard: (opts?: { restoreFocus?: boolean }) => void;
};

export function registerTaskTimerScheduleEvents(options: RegisterScheduleEventsOptions) {
  options.on(options.documentRef as unknown as EventTarget, "click", (event: any) => {
    if (options.currentAppPage() === "schedule") {
      const scheduleCard = (event?.target as HTMLElement | null)?.closest?.(".scheduleTaskCard, .scheduleTrayTask") as HTMLElement | null;
      if (scheduleCard && !scheduleCard.closest("[data-schedule-normalize]")) {
        event?.preventDefault?.();
        event?.stopImmediatePropagation?.();
        return;
      }
    }

    const normalizeButton = (event?.target as HTMLElement | null)?.closest?.("[data-schedule-normalize]") as HTMLElement | null;
    if (normalizeButton) {
      const taskId = String(normalizeButton.dataset.scheduleNormalize || "").trim();
      if (!taskId) return;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      options.toggleTaskScheduleFlexible(taskId);
      return;
    }

    const dayButton = (event?.target as HTMLElement | null)?.closest?.("[data-schedule-day]") as HTMLElement | null;
    if (!dayButton) return;
    const day = options.normalizeScheduleDay(dayButton.dataset.scheduleDay);
    if (!day) return;
    event?.preventDefault?.();
    options.setScheduleSelectedDay(day);
    options.renderSchedulePage();
  });

  options.on(options.documentRef as unknown as EventTarget, "dragstart", (event: any) => {
    if (options.isScheduleMobileLayout()) {
      event?.preventDefault?.();
      return;
    }
    const source = (event?.target as HTMLElement | null)?.closest?.("[data-schedule-task-id]") as HTMLElement | null;
    if (!source) return;
    const taskId = String(source.dataset.scheduleTaskId || "").trim();
    if (!taskId) return;
    const task = options.tasks().find((entry) => String(entry.id || "") === taskId);
    if (!task || !options.isScheduleRenderableTask(task)) {
      event?.preventDefault?.();
      return;
    }
    options.setScheduleDragTaskId(taskId);
    options.clearScheduleDragPreview();
    options.setScheduleDragSourceDay(options.normalizeScheduleDay(source.dataset.scheduleTaskDay) as NonNullScheduleDay | null);
    if (source.classList.contains("scheduleTaskCard")) {
      const rect = source.getBoundingClientRect();
      const pointerOffsetPx = Math.max(0, Math.min(rect.height, (Number(event?.clientY) || 0) - rect.top));
      options.setScheduleDragPointerOffsetMinutes(pointerOffsetPx / options.scheduleMinutePx);
    }
    source.classList.add("isDragging");
    try {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", taskId);
    } catch {
      // ignore browser drag transfer failures
    }
  });

  options.on(options.documentRef as unknown as EventTarget, "dragend", (event: any) => {
    options.setScheduleDragTaskId(null);
    options.setScheduleDragSourceDay(null);
    options.clearScheduleDragPreview();
    (event?.target as HTMLElement | null)?.closest?.("[data-schedule-task-id]")?.classList?.remove?.("isDragging");
    options.documentRef.querySelectorAll(".scheduleDayColumn.isDropActive").forEach((node) => node.classList.remove("isDropActive"));
    if (options.currentAppPage() === "schedule") options.renderSchedulePage();
  });

  options.on(options.documentRef as unknown as EventTarget, "dragover", (event: any) => {
    if (options.isScheduleMobileLayout()) return;
    const dropZone = (event?.target as HTMLElement | null)?.closest?.("[data-schedule-drop-day]") as HTMLElement | null;
    if (!dropZone || !options.getScheduleDragTaskId()) return;
    event?.preventDefault?.();
    const day = options.normalizeScheduleDay(dropZone.dataset.scheduleDropDay);
    const startMinutes = options.resolveScheduleDropStartMinutes(dropZone, event?.clientY);
    options.documentRef.querySelectorAll(".scheduleDayColumn.isDropActive").forEach((node) => node.classList.remove("isDropActive"));
    dropZone.classList.add("isDropActive");
    if (day && (options.getScheduleDragPreviewDay() !== day || options.getScheduleDragPreviewStartMinutes() !== startMinutes)) {
      options.setScheduleDragPreview(day, startMinutes);
      if (options.currentAppPage() === "schedule") options.renderSchedulePage();
    }
    try {
      event.dataTransfer.dropEffect = "move";
    } catch {
      // ignore browser drag transfer failures
    }
  });

  options.on(options.documentRef as unknown as EventTarget, "drop", (event: any) => {
    if (options.isScheduleMobileLayout()) {
      event?.preventDefault?.();
      return;
    }
    const dropZone = (event?.target as HTMLElement | null)?.closest?.("[data-schedule-drop-day]") as HTMLElement | null;
    if (!dropZone) return;
    const taskId = options.getScheduleDragTaskId() || String(event?.dataTransfer?.getData?.("text/plain") || "").trim();
    const day = options.normalizeScheduleDay(dropZone.dataset.scheduleDropDay);
    if (!taskId || !day) return;
    event?.preventDefault?.();
    const startMinutes = options.resolveScheduleDropStartMinutes(dropZone, event?.clientY);
    options.moveTaskOnSchedule(taskId, day, startMinutes, options.getScheduleDragSourceDay());
    options.documentRef.querySelectorAll(".scheduleDayColumn.isDropActive").forEach((node) => node.classList.remove("isDropActive"));
    options.setScheduleDragTaskId(null);
    options.setScheduleDragSourceDay(null);
    options.clearScheduleDragPreview();
  });
}

export function registerTaskTimerWindowRuntimeEvents(options: RegisterWindowRuntimeEventsOptions) {
  options.on(options.windowRef, options.pendingPushEvent as any, () => {
    options.maybeHandlePendingTaskJump();
    options.maybeHandlePendingPushAction();
    void options.rehydrateFromCloudAndRender({ force: true }).then(() => {
      if (options.runtimeDestroyed()) return;
      options.maybeHandlePendingTaskJump();
      options.maybeHandlePendingPushAction();
      options.maybeRestorePendingTimeGoalFlow();
    });
  });
  options.on(options.windowRef, "pagehide", () => {
    void options.flushPendingCloudWrites();
  });
  options.on(options.windowRef, "beforeunload", () => {
    void options.flushPendingCloudWrites();
  });
  options.on(options.windowRef.document, "visibilitychange", () => {
    if (options.windowRef.document.visibilityState === "hidden") {
      void options.flushPendingCloudWrites();
    }
  });
}

export function registerTaskTimerDashboardShellEvents(options: RegisterDashboardShellEventsOptions) {
  options.on(options.dashboardRefreshBtn, "click", () => {
    if (options.isDashboardBusy() || options.dashboardMenuFlipped()) return;
    options.setDashboardRefreshPending(false);
    void options.rehydrateFromCloudAndRender({ force: true });
  });

  options.on(options.dashboardHeatSummaryCloseBtn, "click", () => {
    options.closeDashboardHeatSummaryCard({ restoreFocus: true });
  });
}
