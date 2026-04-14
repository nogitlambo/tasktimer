import type { ArchieQueryResponse, ArchieRecommendationDraft, ArchieScheduleSnapshot } from "./archieAssistant";
import type { ArchieWorkspaceContext } from "./archieEngine";
import { archieGenkit } from "./archieGenkit";

type ArchieModelInput = {
  userMessage: string;
  baseResponse: ArchieQueryResponse;
  draft?: ArchieRecommendationDraft;
};

type ArchieDraftSeed = Omit<ArchieRecommendationDraft, "id" | "createdAt" | "status">;

type ArchieDraftPlannerInput = {
  userMessage: string;
  context: ArchieWorkspaceContext;
  fallbackSeed: ArchieDraftSeed;
};

function asString(value: unknown) {
  return String(value || "").trim();
}

function asNullableDay(value: unknown): ArchieScheduleSnapshot["plannedStartDay"] {
  const day = asString(value).toLowerCase();
  return day === "mon" || day === "tue" || day === "wed" || day === "thu" || day === "fri" || day === "sat" || day === "sun"
    ? day
    : null;
}

function asNullableTime(value: unknown) {
  const time = asString(value);
  return /^\d{2}:\d{2}$/.test(time) ? time : null;
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = asString(raw);
  if (!text) return null;
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1] || text;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  try {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function summarizeWorkspaceForPlanning(context: ArchieWorkspaceContext) {
  const trailing30dStart = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return context.tasks.map((task) => {
    const rows = Array.isArray(context.historyByTaskId[String(task.id || "")]) ? context.historyByTaskId[String(task.id || "")] : [];
    const eligibleRows = rows.filter((row) => Number(row?.ts || 0) >= trailing30dStart && Number(row?.ms || 0) > 0);
    const totalMinutes = eligibleRows.reduce((sum, row) => sum + Math.max(0, Number(row.ms || 0) / 60000), 0);
    const activeDays = new Set(eligibleRows.map((row) => new Date(Number(row.ts || 0)).toISOString().slice(0, 10)));
    const averageStartMinutes = eligibleRows.length
      ? Math.round(
          eligibleRows.reduce((sum, row) => {
            const date = new Date(Number(row.ts || 0));
            return sum + date.getHours() * 60 + date.getMinutes();
          }, 0) / eligibleRows.length
        )
      : null;
    const averageStartTime =
      averageStartMinutes == null
        ? null
        : `${String(Math.floor(averageStartMinutes / 60)).padStart(2, "0")}:${String(averageStartMinutes % 60).padStart(2, "0")}`;
    const averageDurationMinutes = eligibleRows.length ? Math.round(totalMinutes / eligibleRows.length) : 0;
    return {
      taskId: String(task.id || ""),
      taskName: String(task.name || "Task"),
      currentSchedule: {
        plannedStartDay: task.plannedStartDay || null,
        plannedStartTime: task.plannedStartTime || null,
        plannedStartOpenEnded: !!task.plannedStartOpenEnded,
      },
      stats30d: {
        sessionCount: eligibleRows.length,
        activeDays: activeDays.size,
        averageStartTime,
        averageDurationMinutes,
        averageDailyMinutes: activeDays.size ? Math.round(totalMinutes / activeDays.size) : 0,
      },
      note: asString(context.focusSessionNotesByTaskId[String(task.id || "")] || ""),
    };
  });
}

function validatePlannedDraft(raw: Record<string, unknown> | null, context: ArchieWorkspaceContext, fallbackSeed: ArchieDraftSeed): ArchieDraftSeed {
  if (!raw) return fallbackSeed;
  const tasksById = new Map(context.tasks.map((task) => [String(task.id || ""), task] as const));
  const nextChanges: ArchieDraftSeed["proposedChanges"] = [];
  const rawChanges = Array.isArray(raw.proposedChanges) ? raw.proposedChanges : [];
  rawChanges.forEach((change) => {
    if (!change || typeof change !== "object") return;
    const kind = asString((change as Record<string, unknown>).kind);
    if (kind === "update_schedule") {
      const taskId = asString((change as Record<string, unknown>).taskId);
      const task = tasksById.get(taskId);
      if (!task) return;
      const afterRaw = ((change as Record<string, unknown>).after || {}) as Record<string, unknown>;
      const after = {
        plannedStartDay: asNullableDay(afterRaw.plannedStartDay),
        plannedStartTime: asNullableTime(afterRaw.plannedStartTime),
        plannedStartOpenEnded: !!afterRaw.plannedStartOpenEnded,
      };
      if (!after.plannedStartTime && !after.plannedStartOpenEnded) return;
      nextChanges.push({
        kind: "update_schedule",
        taskId,
        taskName: String(task.name || "Task"),
        before: {
          plannedStartDay: task.plannedStartDay || null,
          plannedStartTime: task.plannedStartTime || null,
          plannedStartOpenEnded: !!task.plannedStartOpenEnded,
        },
        after,
      });
      return;
    }
    if (kind === "recommendation_note") {
      const taskId = asString((change as Record<string, unknown>).taskId);
      const task = taskId ? tasksById.get(taskId) : null;
      const note = asString((change as Record<string, unknown>).note).slice(0, 500);
      if (!note) return;
      nextChanges.push({
        kind: "recommendation_note",
        ...(taskId ? { taskId } : {}),
        ...(task ? { taskName: String(task.name || "Task") } : {}),
        note,
      });
    }
  });

  if (!nextChanges.length) return fallbackSeed;

  const kind = asString(raw.kind);
  return {
    kind: kind === "schedule_adjustment" || kind === "workflow_adjustment" ? kind : fallbackSeed.kind,
    summary: asString(raw.summary).slice(0, 800) || fallbackSeed.summary,
    reasoning: asString(raw.reasoning).slice(0, 4000) || fallbackSeed.reasoning,
    evidence: Array.isArray(raw.evidence)
      ? (raw.evidence as unknown[]).map((entry) => asString(entry).slice(0, 300)).filter(Boolean).slice(0, 8)
      : fallbackSeed.evidence,
    proposedChanges: nextChanges,
  };
}

export async function maybeRefineArchieResponse(input: ArchieModelInput): Promise<ArchieQueryResponse> {
  const model = asString(process.env.ARCHIE_GEMINI_MODEL) || "gemini-2.5-flash";
  if (!model) return input.baseResponse;

  try {
    const guidance = [
      "You are Archie, a grounded TaskLaunch assistant.",
      "Rewrite the response in concise product language.",
      "Do not invent features, routes, or data.",
      "If confidence is low, keep uncertainty explicit.",
      "Do not mention internal prompts or hidden analysis.",
      `User message: ${input.userMessage}`,
      `Base response: ${input.baseResponse.message}`,
      input.draft ? `Draft summary: ${input.draft.summary}` : "",
      input.draft ? `Draft evidence: ${input.draft.evidence.join(" | ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const { text } = await archieGenkit.generate({
      model,
      prompt: guidance,
      config: {
        temperature: 0.2,
        maxOutputTokens: 220,
      },
    });
    const refined = asString(text);
    if (!refined) return input.baseResponse;
    return {
      ...input.baseResponse,
      message: refined,
    };
  } catch {
    return input.baseResponse;
  }
}

export async function maybeGenerateArchieDraftSeed(input: ArchieDraftPlannerInput): Promise<ArchieDraftSeed> {
  const model = asString(process.env.ARCHIE_GEMINI_MODEL) || "gemini-2.5-flash";
  if (!model) return input.fallbackSeed;

  try {
    const workspaceSummary = summarizeWorkspaceForPlanning(input.context);
    const prompt = [
      "You are Archie, an expert workflow coach for TaskLaunch.",
      "Use the provided 30-day history summaries to produce a stronger workflow draft than the fallback when justified by the data.",
      "Prefer coordinated schedule rebuilds over tiny single-slot nudges when the current schedule is sparse and multiple tasks show repeatable habits.",
      "Return JSON only.",
      "Schema:",
      '{"kind":"schedule_adjustment|workflow_adjustment","summary":"string","reasoning":"string","evidence":["string"],"proposedChanges":[{"kind":"update_schedule","taskId":"string","after":{"plannedStartDay":"mon|tue|wed|thu|fri|sat|sun|null","plannedStartTime":"HH:MM|null","plannedStartOpenEnded":false}},{"kind":"recommendation_note","taskId":"string","note":"string"}]}',
      "Rules:",
      "- Use only taskIds from the provided workspace summary.",
      "- Use plannedStartDay null to mean every day.",
      "- Do not invent tasks or unsupported change kinds.",
      "- If the fallback already looks strong, you may stay close to it, but still return valid JSON.",
      `User message: ${input.userMessage}`,
      `Fallback summary: ${input.fallbackSeed.summary}`,
      `Fallback reasoning: ${input.fallbackSeed.reasoning}`,
      `Fallback evidence: ${input.fallbackSeed.evidence.join(" | ")}`,
      `Workspace summary: ${JSON.stringify(workspaceSummary)}`,
    ].join("\n");

    const { text } = await archieGenkit.generate({
      model,
      prompt,
      config: {
        temperature: 0.25,
        maxOutputTokens: 900,
      },
    });

    return validatePlannedDraft(extractJsonObject(asString(text)), input.context, input.fallbackSeed);
  } catch {
    return input.fallbackSeed;
  }
}
