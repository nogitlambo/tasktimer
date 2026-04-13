import type {
  ArchieConfidence,
  ArchieDraftChange,
  ArchieQueryResponse,
  ArchieRecommendationDraft,
} from "./archieAssistant";
import { searchArchieKnowledge, toCitation } from "./archieKnowledge";
import type { UserPreferencesV1, TaskUiConfig } from "./cloudStore";
import type { HistoryByTaskId, Task } from "./types";

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
    rows.forEach((row) => {
      const ts = Math.max(0, Math.floor(Number(row?.ts || 0)));
      const ms = Math.max(0, Math.floor(Number(row?.ms || 0)));
      totalMs += ms;
      if (ts > lastLoggedAtMs) lastLoggedAtMs = ts;
      if (ts >= recentWindowStart) recentWeekMs += ms;
    });
    return {
      task,
      totalMs,
      lastLoggedAtMs,
      recentWeekMs,
      note: String(context.focusSessionNotesByTaskId[String(task.id || "")] || "").trim(),
    };
  });
}

function buildBestProductivitySlot(context: ArchieWorkspaceContext): ProductivitySlot | null {
  const totals = new Map<string, number>();
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
    });
  });
  let best: ProductivitySlot | null = null;
  totals.forEach((totalMs, key) => {
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

function buildReorderChanges(sortedInsights: TaskInsight[], targetTaskId: string, insertAt: number): ArchieDraftChange[] {
  const before = [...sortedInsights].sort((a, b) => a.task.order - b.task.order);
  const movedIndex = before.findIndex((entry) => String(entry.task.id || "") === targetTaskId);
  if (movedIndex < 0) return [];
  const after = [...before];
  const [moved] = after.splice(movedIndex, 1);
  const boundedInsertAt = Math.max(0, Math.min(after.length, insertAt));
  after.splice(boundedInsertAt, 0, moved);
  return after
    .map((entry, index) => ({
      beforeOrder: Math.max(0, Math.floor(Number(entry.task.order || 0))),
      afterOrder: index,
      taskId: String(entry.task.id || ""),
      taskName: String(entry.task.name || "Task"),
    }))
    .filter((entry) => entry.beforeOrder !== entry.afterOrder)
    .map((entry) => ({ kind: "reorder_task", ...entry }) satisfies ArchieDraftChange);
}

function isAdviceQuery(question: string) {
  return /(what should|what next|optimi|improve|adjust|recommend|schedule|workflow|prioriti|reorder|plan my|best time|help me plan)/i.test(question);
}

function isRunningTaskQuery(question: string) {
  return /(currently working|running task|working on now|what am i working on)/i.test(question);
}

function noteSnippet(note: string) {
  const cleaned = String(note || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.length > 90 ? `${cleaned.slice(0, 87)}...` : cleaned;
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

function buildKnowledgeResponse(question: string): ArchieQueryResponse | null {
  const hits = searchArchieKnowledge(question);
  if (!hits.length) return null;
  const best = hits[0];
  const confidence: ArchieConfidence = hits.length > 1 ? "medium" : "high";
  return {
    mode: "product_answer",
    message: best.content,
    citations: [toCitation(best)],
    confidence,
    suggestedAction: best.suggestedAction,
  };
}

export function buildRecommendationDraft(context: ArchieWorkspaceContext): DraftSeed | null {
  const sortedInsights = buildTaskInsights(context).sort((a, b) => {
    if (a.task.running !== b.task.running) return a.task.running ? -1 : 1;
    if (a.recentWeekMs !== b.recentWeekMs) return a.recentWeekMs - b.recentWeekMs;
    if (a.lastLoggedAtMs !== b.lastLoggedAtMs) return a.lastLoggedAtMs - b.lastLoggedAtMs;
    return a.task.order - b.task.order;
  });
  const candidate = sortedInsights.find((entry) => !entry.task.running);
  if (!candidate) return null;

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

  const changes: ArchieDraftChange[] = [];
  const reorderChanges = buildReorderChanges(sortedInsights, String(candidate.task.id || ""), context.tasks.some((task) => task.running) ? 1 : 0);
  if (reorderChanges.length) changes.push(...reorderChanges);

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
  const reorderOnly = changes.every((change) => change.kind === "reorder_task");
  const kind = scheduleChanges.length
    ? "schedule_adjustment"
    : reorderOnly
      ? "task_prioritization"
      : "workflow_adjustment";

  const summaryParts = [`I prepared a draft to bring ${candidate.task.name} back into the active flow.`];
  if (scheduleChanges.length) summaryParts.push(`It schedules the task closer to your strongest logged work window.`);
  else if (reorderChanges.length) summaryParts.push(`It moves the task higher in your queue so it is easier to reach.`);

  return {
    kind,
    summary: summaryParts.join(" "),
    reasoning: evidence.join(" "),
    evidence,
    proposedChanges: changes,
  };
}

export function buildFallbackResponse(): ArchieQueryResponse {
  return {
    mode: "fallback",
    message:
      "I am not confident enough to answer that yet from TaskLaunch data alone. Ask about tasks, history, settings, or let me recommend a workflow adjustment.",
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

  const seed = buildRecommendationDraft(context);
  if (!seed) return buildFallbackResponse();
  const draft = createDraft(seed);
  return {
    mode: "workflow_advice",
    message: `${draft.summary} I am keeping the recommendation conservative because the question was not specific enough for a stronger claim.`,
    citations: [],
    confidence: "low",
    suggestedAction: { kind: "reviewDraft", label: "Review Draft", draftId: draft.id },
    draftId: draft.id,
    draft,
  };
}
