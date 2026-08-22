export type TaskClarificationApplyPayloadSubtask = {
  id: string;
  title: string;
  estimatedMinutes: number | null;
};

export type TaskClarificationApplyPayload = {
  acceptedFields: Array<"name" | "subtasks">;
  values: {
    name?: string;
    subtasks?: TaskClarificationApplyPayloadSubtask[];
  };
  idempotencyKey: string;
};

type BuildTaskClarificationApplyPayloadInput = {
  titleSelected: boolean;
  draftTitle: string;
  selectedSubtaskIds: string[];
  draftSubtaskTitles: Record<string, string>;
  subtasks: TaskClarificationApplyPayloadSubtask[];
  idempotencyKey: string;
};

function normalizedEstimatedMinutes(value: unknown): number | null {
  if (value == null) return null;
  const minutes = Math.floor(Number(value));
  return Number.isFinite(minutes) && minutes >= 1 && minutes <= 480 ? minutes : null;
}

export function buildTaskClarificationApplyPayload(input: BuildTaskClarificationApplyPayloadInput): TaskClarificationApplyPayload | null {
  const name = input.titleSelected ? input.draftTitle.trim() : "";
  const selectedSubtaskIds = new Set(input.selectedSubtaskIds.map((id) => String(id || "").trim()).filter(Boolean));
  const selectedSubtasks = input.subtasks
    .filter((subtask) => selectedSubtaskIds.has(subtask.id))
    .map((subtask) => ({
      id: subtask.id.trim(),
      title: (input.draftSubtaskTitles[subtask.id] || subtask.title).trim(),
      estimatedMinutes: normalizedEstimatedMinutes(subtask.estimatedMinutes),
    }))
    .filter((subtask) => subtask.id && subtask.title);

  const acceptedFields: Array<"name" | "subtasks"> = [];
  const values: TaskClarificationApplyPayload["values"] = {};
  if (name) {
    acceptedFields.push("name");
    values.name = name;
  }
  if (selectedSubtasks.length) {
    acceptedFields.push("subtasks");
    values.subtasks = selectedSubtasks;
  }
  if (!acceptedFields.length) return null;
  return {
    acceptedFields,
    values,
    idempotencyKey: input.idempotencyKey.trim(),
  };
}
