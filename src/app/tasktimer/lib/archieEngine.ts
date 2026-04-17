import type {
  ArchieConfidence,
  ArchieDraftChange,
  ArchieQueryResponse,
  ArchieRecommendationDraft,
} from "./archieAssistant";
import { searchArchieKnowledge, toCitation, type ArchieKnowledgeMatch } from "./archieKnowledge";
import type { UserPreferencesV1, TaskUiConfig } from "./cloudStore";
import { getTaskScheduledDayEntries } from "./schedule-placement";
import type { HistoryByTaskId, Task } from "./types";
import { completionDifficultyLabel, normalizeCompletionDifficulty, type CompletionDifficulty } from "./completionDifficulty";
import { isMinuteInProductivityPeriod, normalizeOptimalProductivityPeriod } from "./productivityPeriod";

export type ArchieWorkspaceContext = {
  tasks: Task[];
  historyByTaskId: HistoryByTaskId;
  preferences: UserPreferencesV1 | null;
  taskUi: TaskUiConfig | null;
  focusSessionNotesByTaskId: Record<string, string>;
};

type DraftSeed = Omit<ArchieRecommendationDraft, "id" | "createdAt" | "status">;

type TaskInsight = {
  task: Task;
  totalMs: number;
  lastLoggedAtMs: number;
  recentWeekMs: number;
  recent30dMs: number;
  recent90dMs: number;
  activeDays30d: number;
  sessionCount30d: number;
  sessionCount90d: number;
  note: string;
  completionDifficulty?: CompletionDifficulty;
};

type ProductivitySlot = {
  day: NonNullable<Task["plannedStartDay"]>;
  hour: number;
  totalMs: number;
};

type TaskSchedulePattern = {
  task: Task;
  averageStartMinutes: number;
  averageDurationMinutes: number;
  averageEndMinutes: number;
  activeDays30d: number;
  sessionCount30d: number;
};

function normalizeQuestion(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function humanJoin(values: string[]) {
  const items = values.map((value) => String(value || "").trim()).filter(Boolean);
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function formatHour(hour: number) {
  const clamped = Math.max(0, Math.min(23, Math.floor(Number(hour) || 0)));
  return `${String(clamped).padStart(2, "0")}:00`;
}

function formatTimeOfDay(totalMinutes: number) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(Number(totalMinutes) || 0)));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function snapMinutesToQuarterHour(totalMinutes: number) {
  return Math.max(0, Math.min(24 * 60 - 15, Math.round(Math.max(0, totalMinutes) / 15) * 15));
}

function getEstimatedDurationMinutes(task: Task) {
  if (Number.isFinite(Number(task.timeGoalMinutes)) && Number(task.timeGoalMinutes) > 0) {
    return Math.max(15, Math.round(Number(task.timeGoalMinutes)));
  }
  if (task.timeGoalEnabled && Number(task.timeGoalValue) > 0) {
    const unitMinutes = task.timeGoalUnit === "minute" ? 1 : 60;
    return Math.max(15, Math.round(Number(task.timeGoalValue) * unitMinutes));
  }
  return 60;
}

function plannedStartMinutes(task: Task) {
  const raw = String(task.plannedStartTime || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Math.max(0, Math.min(23, Number(match[1])));
  const minute = Math.max(0, Math.min(59, Number(match[2])));
  return hour * 60 + minute;
}

function buildTaskInsights(context: ArchieWorkspaceContext): TaskInsight[] {
  const now = Date.now();
  const recentWindowStart = now - 7 * 24 * 60 * 60 * 1000;
  const trailing30dStart = now - 30 * 24 * 60 * 60 * 1000;
  const trailing90dStart = now - 90 * 24 * 60 * 60 * 1000;
  return context.tasks.map((task) => {
    const rows = Array.isArray(context.historyByTaskId[String(task.id || "")]) ? context.historyByTaskId[String(task.id || "")] : [];
    let totalMs = 0;
    let lastLoggedAtMs = 0;
    let recentWeekMs = 0;
    let recent30dMs = 0;
    let recent90dMs = 0;
    let sessionCount30d = 0;
    let sessionCount90d = 0;
    const activeDays30d = new Set<string>();
    const recentDifficulties: CompletionDifficulty[] = [];
    let latestDifficultyTs = 0;
    let latestDifficultyValue: CompletionDifficulty | undefined;
    rows.forEach((row) => {
      const ts = Math.max(0, Math.floor(Number(row?.ts || 0)));
      const ms = Math.max(0, Math.floor(Number(row?.ms || 0)));
      const completionDifficulty = normalizeCompletionDifficulty(row?.completionDifficulty);
      totalMs += ms;
      if (ts > lastLoggedAtMs) lastLoggedAtMs = ts;
      if (ts >= recentWindowStart) recentWeekMs += ms;
      if (ts >= trailing30dStart) {
        recent30dMs += ms;
        sessionCount30d += 1;
        activeDays30d.add(new Date(ts).toISOString().slice(0, 10));
      }
      if (ts >= trailing90dStart) {
        recent90dMs += ms;
        sessionCount90d += 1;
      }
      if (completionDifficulty) {
        if (ts >= recentWindowStart) recentDifficulties.push(completionDifficulty);
        if (ts > latestDifficultyTs) {
          latestDifficultyTs = ts;
          latestDifficultyValue = completionDifficulty;
        }
      }
    });
    const averageRecentDifficulty = recentDifficulties.length
      ? Math.round(recentDifficulties.reduce((sum, value) => sum + value, 0) / recentDifficulties.length)
      : null;
    return {
      task,
      totalMs,
      lastLoggedAtMs,
      recentWeekMs,
      recent30dMs,
      recent90dMs,
      activeDays30d: activeDays30d.size,
      sessionCount30d,
      sessionCount90d,
      note: String(context.focusSessionNotesByTaskId[String(task.id || "")] || "").trim(),
      completionDifficulty: normalizeCompletionDifficulty(averageRecentDifficulty) || latestDifficultyValue,
    };
  });
}

function buildTaskSchedulePatterns(context: ArchieWorkspaceContext): TaskSchedulePattern[] {
  const now = Date.now();
  const trailing30dStart = now - 30 * 24 * 60 * 60 * 1000;
  return context.tasks
    .map((task) => {
      const rows = Array.isArray(context.historyByTaskId[String(task.id || "")]) ? context.historyByTaskId[String(task.id || "")] : [];
      const eligibleRows = rows.filter((row) => {
        const ts = Math.max(0, Math.floor(Number(row?.ts || 0)));
        const ms = Math.max(0, Math.floor(Number(row?.ms || 0)));
        return ts >= trailing30dStart && ms > 0;
      });
      if (!eligibleRows.length) return null;
      const activeDays = new Set<string>();
      const totalStartMinutes = eligibleRows.reduce((sum, row) => {
        const startedAt = new Date(Math.floor(Number(row.ts || 0)));
        activeDays.add(startedAt.toISOString().slice(0, 10));
        return sum + startedAt.getHours() * 60 + startedAt.getMinutes();
      }, 0);
      const totalDurationMinutes = eligibleRows.reduce((sum, row) => sum + Math.max(1, Number(row.ms || 0) / 60000), 0);
      const averageStartMinutes = snapMinutesToQuarterHour(totalStartMinutes / eligibleRows.length);
      const averageDurationMinutes = Math.max(15, snapMinutesToQuarterHour(totalDurationMinutes / eligibleRows.length));
      return {
        task,
        averageStartMinutes,
        averageDurationMinutes,
        averageEndMinutes: Math.min(24 * 60, averageStartMinutes + averageDurationMinutes),
        activeDays30d: activeDays.size,
        sessionCount30d: eligibleRows.length,
      } satisfies TaskSchedulePattern;
    })
    .filter((entry): entry is TaskSchedulePattern => !!entry);
}

function averageWeeklyMinutesOverTrailing90d(entry: TaskInsight) {
  return entry.recent90dMs / 60000 / Math.max(1, 90 / 7);
}

function currentWeeklyMinutes(entry: TaskInsight) {
  return entry.recentWeekMs / 60000;
}

function underServiceScore(entry: TaskInsight) {
  const currentWeekly = currentWeeklyMinutes(entry);
  const trailingWeekly = averageWeeklyMinutesOverTrailing90d(entry);
  const recent30dWeekly = entry.recent30dMs / 60000 / Math.max(1, 30 / 7);
  const expectedWeekly = Math.max(trailingWeekly, recent30dWeekly, 1);
  const dropRatio = currentWeekly / expectedWeekly;
  const inactivityPenalty = entry.lastLoggedAtMs > 0 ? Math.min(60, Math.max(0, (Date.now() - entry.lastLoggedAtMs) / (24 * 60 * 60 * 1000))) : 60;
  const consistencyPenalty = Math.max(0, 12 - entry.activeDays30d);
  const sessionPenalty = Math.max(0, 10 - entry.sessionCount90d);
  return (1 - Math.min(1, dropRatio)) * 100 + inactivityPenalty + consistencyPenalty + sessionPenalty;
}

function isSchedulePlanningQuery(question: string) {
  return /(schedule|calendar|daily plan|plan my day|workflow revamp|rebuild my workflow|full revamp|routine|based on .*30 days|based on .*90 days)/i.test(
    question
  );
}

function hasScheduleOverlapForSnapshot(
  tasks: Task[],
  candidateTaskId: string,
  snapshot: { plannedStartDay: Task["plannedStartDay"]; plannedStartTime: string | null; plannedStartOpenEnded: boolean },
  durationMinutes: number,
  overrides: Map<string, { plannedStartDay: Task["plannedStartDay"]; plannedStartTime: string | null; plannedStartOpenEnded: boolean }>
) {
  if (snapshot.plannedStartOpenEnded && !snapshot.plannedStartTime) return false;
  const startMinutes = plannedStartMinutes({
    id: candidateTaskId,
    name: "",
    order: 0,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    hasStarted: false,
    plannedStartTime: snapshot.plannedStartTime,
  });
  if (startMinutes == null) return false;
  const candidateDays = snapshot.plannedStartDay ? [snapshot.plannedStartDay] : (["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const);
  return tasks.some((task) => {
    const taskId = String(task.id || "");
    if (taskId === candidateTaskId) return false;
    const source = overrides.get(taskId) || {
      plannedStartDay: task.plannedStartDay || null,
      plannedStartTime: task.plannedStartTime || null,
      plannedStartOpenEnded: !!task.plannedStartOpenEnded,
    };
    const otherDuration = getEstimatedDurationMinutes(task);
    const scheduledEntries = getTaskScheduledDayEntries(task);
    if (scheduledEntries.length > 0) {
      return scheduledEntries.some((entry) => {
        if (!candidateDays.includes(entry.day)) return false;
        const otherStartMinutes = plannedStartMinutes({
          id: taskId,
          name: "",
          order: 0,
          accumulatedMs: 0,
          running: false,
          startMs: null,
          collapsed: false,
          milestonesEnabled: false,
          milestones: [],
          hasStarted: false,
          plannedStartTime: entry.time,
        });
        return otherStartMinutes != null && startMinutes < otherStartMinutes + otherDuration && otherStartMinutes < startMinutes + durationMinutes;
      });
    }
    if (source.plannedStartOpenEnded) return false;
    const otherStartMinutes = plannedStartMinutes({
      id: taskId,
      name: "",
      order: 0,
      accumulatedMs: 0,
      running: false,
      startMs: null,
      collapsed: false,
      milestonesEnabled: false,
      milestones: [],
      hasStarted: false,
      plannedStartTime: source.plannedStartTime,
    });
    if (otherStartMinutes == null) return false;
    const otherDays = source.plannedStartDay ? [source.plannedStartDay] : (["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const);
    const overlapsAnyDay = candidateDays.some((day) => otherDays.includes(day));
    if (!overlapsAnyDay) return false;
    return startMinutes < otherStartMinutes + otherDuration && otherStartMinutes < startMinutes + durationMinutes;
  });
}

function buildWorkflowRevampDraft(context: ArchieWorkspaceContext): DraftSeed | null {
  const schedulePatterns = buildTaskSchedulePatterns(context)
    .filter((entry) => entry.activeDays30d >= 4 || entry.sessionCount30d >= 6)
    .sort((a, b) => {
      if (a.averageStartMinutes !== b.averageStartMinutes) return a.averageStartMinutes - b.averageStartMinutes;
      if (a.activeDays30d !== b.activeDays30d) return b.activeDays30d - a.activeDays30d;
      return String(a.task.id || "").localeCompare(String(b.task.id || ""));
    });

  if (schedulePatterns.length < 2) return null;

  const currentlyScheduledCount = context.tasks.filter((task) => !!String(task.plannedStartTime || "").trim()).length;
  if (currentlyScheduledCount >= schedulePatterns.length) return null;

  const overrides = new Map<string, { plannedStartDay: Task["plannedStartDay"]; plannedStartTime: string | null; plannedStartOpenEnded: boolean }>();
  const changes: ArchieDraftChange[] = [];
  const evidence: string[] = [];
  let previousEndMinutes = 0;

  schedulePatterns.forEach((pattern) => {
    const startMinutes = Math.max(pattern.averageStartMinutes, previousEndMinutes);
    const snappedStartMinutes = snapMinutesToQuarterHour(startMinutes);
    const snapshot = {
      plannedStartDay: null as Task["plannedStartDay"],
      plannedStartTime: formatTimeOfDay(snappedStartMinutes),
      plannedStartOpenEnded: false,
    };
    const durationMinutes = Math.max(15, pattern.averageDurationMinutes);
    if (hasScheduleOverlapForSnapshot(context.tasks, String(pattern.task.id || ""), snapshot, durationMinutes, overrides)) {
      return;
    }
    overrides.set(String(pattern.task.id || ""), snapshot);
    previousEndMinutes = snappedStartMinutes + durationMinutes;
    changes.push({
      kind: "update_schedule",
      taskId: String(pattern.task.id || ""),
      taskName: String(pattern.task.name || "Task"),
      before: {
        plannedStartDay: pattern.task.plannedStartDay || null,
        plannedStartTime: pattern.task.plannedStartTime || null,
        plannedStartOpenEnded: !!pattern.task.plannedStartOpenEnded,
      },
      after: snapshot,
    });
    evidence.push(
      `${pattern.task.name} averaged ${Math.round(pattern.averageDurationMinutes)} minutes, started around ${formatTimeOfDay(
        pattern.averageStartMinutes
      )}, and was active on ${pattern.activeDays30d} of the last 30 days.`
    );
  });

  if (changes.length < 2) return null;

  const summary = `I prepared a full schedule revamp based on your last 30 days, with daily task slots added for ${changes
    .map((change) => change.taskName)
    .slice(0, 3)
    .join(", ")}${changes.length > 3 ? ", and the rest of your active workflow." : "."}`;

  const reasoning = `Your schedule is currently sparse, but your last 30 days show repeatable start times and session lengths across multiple tasks. Instead of adding one isolated slot, this draft rebuilds your daily workflow around those repeated patterns so each active task has a clear place in the week.`;

  return {
    kind: "schedule_adjustment",
    summary,
    reasoning,
    evidence,
    proposedChanges: changes,
  };
}

function buildBestProductivitySlot(context: ArchieWorkspaceContext): ProductivitySlot | null {
  const totals = new Map<string, number>();
  const configuredPeriod = normalizeOptimalProductivityPeriod({
    optimalProductivityStartTime: context.preferences?.optimalProductivityStartTime,
    optimalProductivityEndTime: context.preferences?.optimalProductivityEndTime,
  });
  const preferredTotals = new Map<string, number>();
  Object.values(context.historyByTaskId).forEach((rows) => {
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const ts = Math.floor(Number(row?.ts || 0));
      const ms = Math.max(0, Math.floor(Number(row?.ms || 0)));
      if (!ts || !ms) return;
      const date = new Date(ts);
      const dayIndex = date.getDay();
      const dayKeys: Array<NonNullable<Task["plannedStartDay"]>> = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
      const day = dayKeys[dayIndex] || "mon";
      const hour = date.getHours();
      const key = `${day}:${hour}`;
      totals.set(key, (totals.get(key) || 0) + ms);
      if (isMinuteInProductivityPeriod(hour * 60, configuredPeriod)) {
        preferredTotals.set(key, (preferredTotals.get(key) || 0) + ms);
      }
    });
  });
  let best: ProductivitySlot | null = null;
  const eligibleTotals = preferredTotals.size ? preferredTotals : totals;
  eligibleTotals.forEach((totalMs, key) => {
    const [dayRaw, hourRaw] = key.split(":");
    const day = dayRaw as NonNullable<Task["plannedStartDay"]>;
    const hour = Math.floor(Number(hourRaw || 0));
    if (!best || totalMs > best.totalMs) {
      best = { day, hour, totalMs };
    }
  });
  return best;
}

function scheduleHasOverlap(tasks: Task[], candidateTaskId: string, day: NonNullable<Task["plannedStartDay"]>, startMinutes: number, durationMinutes: number) {
  return tasks.some((task) => {
    if (String(task.id || "") === candidateTaskId) return false;
    const existingDuration = getEstimatedDurationMinutes(task);
    const scheduledEntries = getTaskScheduledDayEntries(task).filter((entry) => entry.day === day);
    if (scheduledEntries.length > 0) {
      return scheduledEntries.some((entry) => {
        const existingStart = plannedStartMinutes({
          id: String(task.id || ""),
          name: "",
          order: 0,
          accumulatedMs: 0,
          running: false,
          startMs: null,
          collapsed: false,
          milestonesEnabled: false,
          milestones: [],
          hasStarted: false,
          plannedStartTime: entry.time,
        });
        return existingStart != null && startMinutes < existingStart + existingDuration && existingStart < startMinutes + durationMinutes;
      });
    }
    if (task.plannedStartDay !== day || task.plannedStartOpenEnded) return false;
    const existingStart = plannedStartMinutes(task);
    if (existingStart == null) return false;
    return startMinutes < existingStart + existingDuration && existingStart < startMinutes + durationMinutes;
  });
}

function isAdviceQuery(question: string) {
  return /(what should|what next|optimi|improve|adjust|recommend|schedule|workflow|prioriti|reorder|plan my|best time|help me plan)/i.test(question);
}

function isRunningTaskQuery(question: string) {
  return /(currently working|running task|working on now|what am i working on)/i.test(question);
}

function isProductQuestion(question: string) {
  return /(how do i|how to|where is|what is|what does|can i|does tasklaunch|in settings|history manager|dashboard|focus mode|appearance|theme|backup|export|import|reset|notifications|privacy|account|user guide|feedback)/i.test(
    question
  );
}

function noteSnippet(note: string) {
  const cleaned = String(note || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.length > 90 ? `${cleaned.slice(0, 87)}...` : cleaned;
}

function completionDifficultyPhrase(value: unknown) {
  const label = completionDifficultyLabel(value);
  return label ? label.toLowerCase() : "";
}

function buildDraftReasoning(input: {
  candidate: TaskInsight;
  runningTasks: Task[];
  scheduleChanges: Extract<ArchieDraftChange, { kind: "update_schedule" }>[];
  bestSlot: ProductivitySlot | null;
  evidence: string[];
}) {
  const lines: string[] = [];
  const runningTaskNames = input.runningTasks.map((task) => String(task.name || "Task")).filter(Boolean);
  const taskName = String(input.candidate.task.name || "Task");

  if (runningTaskNames.length) {
    lines.push(
      `${taskName} is currently under-served compared with the rest of your active queue, so this draft brings it forward without interrupting ${humanJoin(runningTaskNames)}.`
    );
  } else {
    lines.push(`${taskName} is currently under-served in your queue, so this draft brings it back into your active flow instead of leaving it buried.`);
  }

  if (input.candidate.lastLoggedAtMs > 0) {
    lines.push(`${taskName} has not been logged since ${new Date(input.candidate.lastLoggedAtMs).toLocaleDateString("en-US")}.`);
  } else {
    lines.push(`${taskName} has no completed history yet, which is why Archie is treating it as the next task to surface.`);
  }

  if (input.candidate.recentWeekMs <= 0) {
    lines.push(`It also has no logged time in the last 7 days, so the current flow is not naturally bringing you back to it.`);
  } else if (input.candidate.recent90dMs > input.candidate.recentWeekMs) {
    lines.push(
      `Its last 7 days are running below its broader 90-day pattern, so Archie is treating it as under-served rather than inactive overall.`
    );
  }

  if (input.candidate.activeDays30d > 0) {
    lines.push(
      `${taskName} was active on ${input.candidate.activeDays30d} day${input.candidate.activeDays30d === 1 ? "" : "s"} in the last 30 days.`
    );
  }

  if (input.candidate.note) {
    lines.push(`Your latest focus note for this task was "${noteSnippet(input.candidate.note)}", so the draft keeps that context in mind.`);
  }

  if (input.candidate.completionDifficulty && input.candidate.completionDifficulty <= 2) {
    lines.push(
      `Your recent challenge rating for ${taskName} was ${completionDifficultyPhrase(input.candidate.completionDifficulty)}, so Archie is treating it as a task that may need a better fit.`
    );
  }

  if (input.scheduleChanges.length && input.bestSlot) {
    lines.push(
      `The schedule change moves it into your strongest logged work window on ${input.bestSlot.day.toUpperCase()} around ${formatHour(input.bestSlot.hour)}, which is the best fit the current history suggests.`
    );
  }

  if (!input.scheduleChanges.length && input.evidence.length) {
    lines.push(input.evidence[0] || "");
  }

  return lines.join(" ");
}

function buildCurrentWorkResponse(context: ArchieWorkspaceContext): ArchieQueryResponse | null {
  const runningTasks = context.tasks.filter((task) => !!task.running);
  if (!runningTasks.length) {
    return {
      mode: "workflow_advice",
      message: "Nothing is actively running right now. Ask me what to tackle next and I can prepare a draft recommendation.",
      citations: [],
      confidence: "medium",
    };
  }
  const firstTask = runningTasks[0];
  return {
    mode: "workflow_advice",
    message: `You are currently tracking ${humanJoin(runningTasks.slice(0, 3).map((task) => task.name || "Task"))}.`,
    citations: [],
    confidence: "high",
    suggestedAction: firstTask?.id ? { kind: "jumpToTask", label: `Jump To ${firstTask.name}`, taskId: firstTask.id } : undefined,
  };
}

function knowledgeMatchConfidence(best: ArchieKnowledgeMatch | undefined, nextBest: ArchieKnowledgeMatch | undefined): ArchieConfidence | null {
  if (!best) return null;
  const hasStrongPhraseMatch = best.matchedPhraseCount > 0;
  const hasConcreteTokenCoverage = best.matchedTokenCount >= 2 && best.matchedTokenCount >= best.unmatchedTokenCount;
  if (!hasStrongPhraseMatch && !hasConcreteTokenCoverage) return null;
  if (best.matchedKeywordCount === 0 && best.matchedTokenCount < 2) return null;
  if (best.score >= 11 && (!nextBest || best.score - nextBest.score >= 3)) return "high";
  if (best.score >= 7) return "medium";
  return null;
}

function buildKnowledgeResponse(question: string): ArchieQueryResponse | null {
  const matches = searchArchieKnowledge(question);
  if (!matches.length) return null;
  const best = matches[0];
  const nextBest = matches[1];
  const confidence = knowledgeMatchConfidence(best, nextBest);
  if (!confidence) return null;
  return {
    mode: "product_answer",
    message: best.entry.answer,
    citations: [toCitation(best.entry)],
    confidence,
    suggestedAction: best.entry.suggestedAction,
  };
}

export function buildRecommendationDraft(context: ArchieWorkspaceContext, question = ""): DraftSeed | null {
  const normalizedQuestion = normalizeQuestion(question);
  if (isSchedulePlanningQuery(normalizedQuestion)) {
    const workflowRevampDraft = buildWorkflowRevampDraft(context);
    if (workflowRevampDraft) return workflowRevampDraft;
  }
  const sortedInsights = buildTaskInsights(context).sort((a, b) => {
    if (a.task.running !== b.task.running) return a.task.running ? -1 : 1;
    const aScore = underServiceScore(a);
    const bScore = underServiceScore(b);
    if (aScore !== bScore) return bScore - aScore;
    if (a.recentWeekMs !== b.recentWeekMs) return a.recentWeekMs - b.recentWeekMs;
    if (a.recent30dMs !== b.recent30dMs) return a.recent30dMs - b.recent30dMs;
    if (a.recent90dMs !== b.recent90dMs) return a.recent90dMs - b.recent90dMs;
    const aDifficulty = a.completionDifficulty ?? 3;
    const bDifficulty = b.completionDifficulty ?? 3;
    if (aDifficulty !== bDifficulty) return aDifficulty - bDifficulty;
    if (a.lastLoggedAtMs !== b.lastLoggedAtMs) return a.lastLoggedAtMs - b.lastLoggedAtMs;
    return String(a.task.id || a.task.name || "").localeCompare(String(b.task.id || b.task.name || ""));
  });
  const candidate = sortedInsights.find((entry) => !entry.task.running);
  if (!candidate) return null;
  const runningTasks = context.tasks.filter((task) => !!task.running);

  const evidence: string[] = [];
  if (candidate.lastLoggedAtMs > 0) {
    evidence.push(`${candidate.task.name} has not been logged since ${new Date(candidate.lastLoggedAtMs).toLocaleDateString("en-US")}.`);
  } else {
    evidence.push(`${candidate.task.name} has no completed history yet.`);
  }
  if (candidate.recentWeekMs <= 0) {
    evidence.push(`${candidate.task.name} has no logged time in the last 7 days.`);
  } else if (candidate.recent90dMs > candidate.recentWeekMs) {
    evidence.push(`${candidate.task.name} is below its broader 90-day activity pattern this week.`);
  }
  if (candidate.activeDays30d > 0) {
    evidence.push(`${candidate.task.name} was active on ${candidate.activeDays30d} days in the last 30 days.`);
  }
  if (candidate.note) {
    evidence.push(`Recent focus note: "${noteSnippet(candidate.note)}"`);
  }
  if (candidate.completionDifficulty) {
    evidence.push(`Recent challenge rating: ${completionDifficultyLabel(candidate.completionDifficulty)}.`);
  }

  const changes: ArchieDraftChange[] = [];

  const bestSlot = buildBestProductivitySlot(context);
  if (bestSlot) {
    const startMinutes = bestSlot.hour * 60;
    const durationMinutes = getEstimatedDurationMinutes(candidate.task);
    if (
      (candidate.task.plannedStartDay !== bestSlot.day || candidate.task.plannedStartTime !== formatHour(bestSlot.hour) || candidate.task.plannedStartOpenEnded) &&
      !scheduleHasOverlap(context.tasks, String(candidate.task.id || ""), bestSlot.day, startMinutes, durationMinutes)
    ) {
      changes.push({
        kind: "update_schedule",
        taskId: String(candidate.task.id || ""),
        taskName: String(candidate.task.name || "Task"),
        before: {
          plannedStartDay: candidate.task.plannedStartDay || null,
          plannedStartTime: candidate.task.plannedStartTime || null,
          plannedStartOpenEnded: !!candidate.task.plannedStartOpenEnded,
        },
        after: {
          plannedStartDay: bestSlot.day,
          plannedStartTime: formatHour(bestSlot.hour),
          plannedStartOpenEnded: false,
        },
      });
      evidence.push(`Your strongest logged productivity window is ${bestSlot.day.toUpperCase()} around ${formatHour(bestSlot.hour)}.`);
    }
  }

  if (!changes.length) {
    changes.push({
      kind: "recommendation_note",
      taskId: String(candidate.task.id || ""),
      taskName: String(candidate.task.name || "Task"),
      note: `Revisit ${candidate.task.name} next. It is currently under-served relative to your recent history.`,
    });
  }

  const scheduleChanges = changes.filter((change) => change.kind === "update_schedule");
  const kind = scheduleChanges.length ? "schedule_adjustment" : "workflow_adjustment";

  const summaryParts = [`I prepared a draft to bring ${candidate.task.name} back into the active flow.`];
  if (scheduleChanges.length) summaryParts.push(`It schedules the task closer to your strongest logged work window.`);

  return {
    kind,
    summary: summaryParts.join(" "),
    reasoning: buildDraftReasoning({
      candidate,
      runningTasks,
      scheduleChanges,
      bestSlot,
      evidence,
    }),
    evidence,
    proposedChanges: changes,
  };
}

export function buildFallbackResponse(): ArchieQueryResponse {
  return {
    mode: "fallback",
    message:
      "I am not confident enough to answer that from current TaskLaunch documentation. Ask about a specific feature or ask me for workflow advice.",
    citations: [],
    confidence: "low",
  };
}

export function buildArchieQueryResponse(
  question: string,
  context: ArchieWorkspaceContext,
  createDraft: (seed: DraftSeed) => ArchieRecommendationDraft
): ArchieQueryResponse {
  const normalized = normalizeQuestion(question);
  if (!normalized) return buildFallbackResponse();

  if (isRunningTaskQuery(normalized)) {
    return buildCurrentWorkResponse(context) || buildFallbackResponse();
  }

  if (isAdviceQuery(normalized)) {
    const seed = buildRecommendationDraft(context, normalized);
    if (!seed) return buildFallbackResponse();
    const draft = createDraft(seed);
    return {
      mode: "workflow_advice",
      message: draft.summary,
      citations: [],
      confidence: "medium",
      suggestedAction: { kind: "reviewDraft", label: "Review Draft", draftId: draft.id },
      draftId: draft.id,
      draft,
    };
  }

  const knowledgeResponse = buildKnowledgeResponse(normalized);
  if (knowledgeResponse) return knowledgeResponse;

  if (isProductQuestion(normalized)) return buildFallbackResponse();

  return buildFallbackResponse();
}
