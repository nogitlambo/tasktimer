const xpAwardButtonLabelByTaskId = new Map<string, string>();

function normalizeTaskId(taskIdRaw: unknown): string {
  return String(taskIdRaw || "").trim();
}

export function setXpAwardButtonLabelOverride(taskIdRaw: unknown, labelRaw: string): void {
  const taskId = normalizeTaskId(taskIdRaw);
  const label = String(labelRaw || "").trim();
  if (!taskId || !label) return;
  xpAwardButtonLabelByTaskId.set(taskId, label);
}

export function clearXpAwardButtonLabelOverride(taskIdRaw: unknown): void {
  const taskId = normalizeTaskId(taskIdRaw);
  if (!taskId) return;
  xpAwardButtonLabelByTaskId.delete(taskId);
}

export function getXpAwardButtonLabelOverride(taskIdRaw: unknown): string {
  const taskId = normalizeTaskId(taskIdRaw);
  return taskId ? xpAwardButtonLabelByTaskId.get(taskId) || "" : "";
}

export function applyXpAwardButtonLabelOverride(taskEl: HTMLElement | null | undefined, taskIdRaw: unknown): void {
  const label = getXpAwardButtonLabelOverride(taskIdRaw);
  if (!taskEl || !label || typeof taskEl.querySelector !== "function") return;
  const button = taskEl.querySelector(".taskPrimaryAction") as HTMLElement | null;
  const labelEl = taskEl.querySelector(".taskPrimaryActionPrimary") as HTMLElement | null;
  if (!button || !labelEl) return;
  labelEl.textContent = label;
  if (label === "Reset") {
    button.classList.remove("isXpAwardReceiving");
    button.classList.remove("btn-accent", "btn-resume", "btn-done", "taskPrimaryActionLaunch", "taskPrimaryActionResume", "taskPrimaryActionStop", "taskPrimaryActionDone");
    button.classList.add("btn-warn", "taskPrimaryActionReset");
    button.setAttribute("data-action", "reset");
    button.setAttribute("title", "Reset");
    button.setAttribute("aria-label", "Reset");
    if ("disabled" in button) (button as HTMLButtonElement).disabled = false;
  } else {
    button.classList.add("isXpAwardReceiving");
  }
}
