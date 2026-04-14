import type {
  ArchieConfidence,
  ArchieDraftChange,
  ArchieQueryResponse,
  ArchieRecommendationDraft,
} from "./archieAssistant";
import { searchArchieKnowledge, toCitation, type ArchieKnowledgeMatch } from "./archieKnowledge";
import type { UserPreferencesV1, TaskUiConfig } from "./cloudStore";
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
  note: string;
  completionDifficulty?: CompletionDifficulty;
};

type ProductivitySlot = {
  day: NonNullable<Task["plannedStartDay"]>;
  hour: number;
  totalMs: number;
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
  return context.tasks.map((task) => {
    const rows = Array.isArray(context.historyByTaskId[String(task.id || "")]) ? context.historyByTaskId[String(task.id || "")] : [];
    let totalMs = 0;
    let lastLoggedAtMs = 0;
    let recentWeekMs = 0;
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
      note: String(context.focusSessionNotesByTaskId[String(task.id || "")] || "").trim(),
      completionDifficulty: normalizeCompletionDifficulty(averageRecentDifficulty) || latestDifficultyValue,
    };
  });
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
    if (task.plannedStartDay !== day || task.plannedStartOpenEnded) return false;
    const existingStart = plannedStartMinutes(task);
    if (existingStart == null) return false;
    const existingDuration = getEstimatedDurationMinutes(task);
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

export function buildRecommendationDraft(context: ArchieWorkspaceContext): DraftSeed | null {
  const sortedInsights = buildTaskInsights(context).sort((a, b) => {
    if (a.task.running !== b.task.running) return a.task.running ? -1 : 1;
    if (a.recentWeekMs !== b.recentWeekMs) return a.recentWeekMs - b.recentWeekMs;
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
    const seed = buildRecommendationDraft(context);
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
