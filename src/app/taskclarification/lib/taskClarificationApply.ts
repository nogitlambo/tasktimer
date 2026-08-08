import { z } from "zod";

export const TASK_CLARIFICATION_SUPPORTED_APPLY_FIELDS = ["name", "subtasks"] as const;

const TaskClarificationApplyRequestSchema = z
  .object({
    acceptedFields: z.array(z.enum(TASK_CLARIFICATION_SUPPORTED_APPLY_FIELDS)).min(1).max(2),
    values: z
      .object({
        name: z.string().trim().min(1).max(160).optional(),
        subtasks: z
          .array(
            z
              .object({
                id: z.string().trim().min(1).max(160),
                title: z.string().trim().min(1).max(160),
                estimatedMinutes: z.number().int().min(1).max(480).nullable(),
              })
              .strict()
          )
          .min(1)
          .max(8)
          .optional(),
      })
      .strict(),
    idempotencyKey: z.string().trim().min(1).max(160),
  })
  .strict()
  .superRefine((value, ctx) => {
    const accepted = new Set(value.acceptedFields);
    if (accepted.has("name") !== (value.values.name !== undefined)) {
      ctx.addIssue({ code: "custom", path: ["values", "name"], message: "Name must match the selected fields." });
    }
    if (accepted.has("subtasks") !== (value.values.subtasks !== undefined)) {
      ctx.addIssue({ code: "custom", path: ["values", "subtasks"], message: "Subtasks must match the selected fields." });
    }
  });

export type TaskClarificationApplyRequest = z.infer<typeof TaskClarificationApplyRequestSchema>;

export function parseTaskClarificationApplyRequest(value: unknown): TaskClarificationApplyRequest {
  return TaskClarificationApplyRequestSchema.parse(value);
}

export function buildTaskClarificationApplyPatch(request: TaskClarificationApplyRequest): { name?: string } {
  return request.values.name ? { name: request.values.name.trim() } : {};
}

export function buildTaskClarificationSelectedSubtasks(request: TaskClarificationApplyRequest) {
  return request.values.subtasks || [];
}
