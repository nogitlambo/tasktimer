import type { ScheduleRepairFutureDay } from "./scheduleRepairCandidates";
import type { ScheduleRepairCapacity, ScheduleRepairTask } from "./scheduleRepairContract";

export type ScheduleRepairEvaluationFixture = {
  id: string;
  category: string;
  localDate: string;
  tasks: ScheduleRepairTask[];
  capacity: ScheduleRepairCapacity;
  futureDays: ScheduleRepairFutureDay[];
};

const LOCAL_DATE = "2026-08-08";

function datePlusDays(days: number) {
  const date = new Date(`${LOCAL_DATE}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function task(id: string, overrides: Partial<ScheduleRepairTask> = {}): ScheduleRepairTask {
  return {
    id,
    taskVersion: `${id}-version`,
    estimatedMinutes: 40,
    completedMinutes: 0,
    dueDate: null,
    priority: "medium",
    hardDeadline: false,
    flexible: true,
    pinned: false,
    inProgress: false,
    requiresClarification: false,
    blocksImportantWork: false,
    plannedDate: LOCAL_DATE,
    dependencySensitive: false,
    partialProgressUseful: false,
    recentlyMoved: false,
    recurrenceLocked: false,
    ownerUid: "fixture-user",
    editable: true,
    active: true,
    completed: false,
    ...overrides,
  };
}

function capacity(max: number): ScheduleRepairCapacity {
  return { remainingRange: { min: Math.max(0, Math.min(max, 30)), max }, state: "STANDARD", confidence: "HIGH", primarySource: "DEFAULT", manualOverride: null, source: "ADAPTIVE_CAPACITY" };
}

export function buildDeterministicScheduleRepairFixtures(count = 120): ScheduleRepairEvaluationFixture[] {
  return Array.from({ length: Math.max(100, count) }, (_, index) => {
    const mode = index % 12;
    const severe = mode === 1 || mode === 5 || mode === 9;
    const noRepair = mode === 0;
    const futureOverloaded = mode === 4 || mode === 10;
    const noSafeSolution = mode === 8;
    const localCapacity = noRepair ? 120 : severe ? 45 : 60;
    const flexibleMinutes = noRepair ? 40 : severe ? 110 : 80;
    const tasks: ScheduleRepairTask[] = [task(`flexible-${index}`, { estimatedMinutes: flexibleMinutes, partialProgressUseful: mode === 6, ...(mode === 6 ? { flexible: false, pinned: true } : {}) })];
    if (mode === 2) tasks.push(task(`due-today-${index}`, { estimatedMinutes: 50, flexible: false, dueDate: LOCAL_DATE, hardDeadline: true, priority: "high" }));
    if (mode === 3) tasks.push(task(`pinned-${index}`, { estimatedMinutes: 45, flexible: false, pinned: true }));
    if (mode === 7) tasks.push(task(`unknown-${index}`, { estimatedMinutes: null, flexible: undefined, requiresClarification: true }));
    if (noSafeSolution) tasks.splice(0, tasks.length, task(`hard-${index}`, { estimatedMinutes: 100, flexible: false, pinned: true, priority: "medium" }));
    const futureDays: ScheduleRepairFutureDay[] = Array.from({ length: 7 }, (_, dayIndex) => ({
      date: datePlusDays(dayIndex + 1),
      plannedMinutes: futureOverloaded && dayIndex === 0 ? 55 : 0,
      capacityMax: 60,
      available: true,
    }));
    return {
      id: `fixture-${String(index + 1).padStart(3, "0")}`,
      category: noRepair ? "no-repair" : noSafeSolution ? "no-safe-solution" : futureOverloaded ? "future-overload" : severe ? "severe-overload" : "slight-overload",
      localDate: LOCAL_DATE,
      tasks,
      capacity: capacity(localCapacity),
      futureDays,
    };
  });
}
