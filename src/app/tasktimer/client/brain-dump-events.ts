export const TASKTIMER_OPEN_BRAIN_DUMP_EVENT = "tasktimer:openBrainDump";

export type TaskTimerOpenBrainDumpDetail = {
  entryPoint?: string;
};

export function createTaskTimerOpenBrainDumpEvent(
  detail: TaskTimerOpenBrainDumpDetail = {},
): CustomEvent<TaskTimerOpenBrainDumpDetail> {
  return new CustomEvent<TaskTimerOpenBrainDumpDetail>(TASKTIMER_OPEN_BRAIN_DUMP_EVENT, { detail });
}

export function dispatchTaskTimerOpenBrainDumpEvent(
  targetWindow: Pick<Window, "dispatchEvent"> | null | undefined,
  detail: TaskTimerOpenBrainDumpDetail = {},
) {
  if (!targetWindow || typeof CustomEvent === "undefined") return false;
  return targetWindow.dispatchEvent(createTaskTimerOpenBrainDumpEvent(detail));
}
