import type { Task } from "../lib/types";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { dispatchTaskClarificationOpenEvent } from "./task-clarification-events";
import { trackRecovery } from "@/app/recovery/lib/recoveryTelemetry";

import { getApiUrl } from "../lib/apiClient";

type RecoveryActionType = "KEEP_ACTIVE" | "DEFER_TO_LATER_DAY" | "REMOVE_FROM_TODAY" | "REVIEW_DEADLINE" | "CLARIFY_TASK" | "MARK_FOR_LATER_REVIEW";
type RecoveryClassification = "URGENT" | "IMPORTANT" | "FLEXIBLE" | "STALE" | "UNCLEAR";

type RecoveryAction = {
  id: string;
  type: RecoveryActionType;
  taskId: string;
  taskVersion: string;
  toDate?: string | null;
  reasonCodes: string[];
  selected: boolean;
  status: string;
  classification?: RecoveryClassification;
};

type RecoverySession = {
  id: string;
  status: "ACTIVE" | "PARTIALLY_APPLIED";
  backlogCount: number;
  overdueCount: number;
  urgentCount: number;
  flexibleCount: number;
  staleCount: number;
  remainingCapacity?: { min: number; max: number } | null;
  restartTaskId?: string | null;
  reversibleUntil?: string | null;
  downstreamInvalidationId?: string | null;
  actions: RecoveryAction[];
};

type ParsedRecoveryResponse = { kind: "session"; session: RecoverySession } | { kind: "empty" } | { kind: "invalid" };
type Options = {
  documentRef?: Document;
  windowRef?: Window;
  fetchImpl?: typeof fetch;
  getCurrentAppPage: () => string;
  getTasks: () => Task[];
  jumpToTaskById?: (taskId: string) => void;
  getIdToken?: () => Promise<string | null>;
};

const actionTypes = new Set<RecoveryActionType>(["KEEP_ACTIVE", "DEFER_TO_LATER_DAY", "REMOVE_FROM_TODAY", "REVIEW_DEADLINE", "CLARIFY_TASK", "MARK_FOR_LATER_REVIEW"]);
const classifications = new Set<RecoveryClassification>(["URGENT", "IMPORTANT", "FLEXIBLE", "STALE", "UNCLEAR"]);

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function parseSession(value: unknown): RecoverySession | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = asString(raw.id, 180);
  const status = raw.status;
  const actions = Array.isArray(raw.actions) ? raw.actions.flatMap((entry): RecoveryAction[] => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const actionId = asString(row.id, 180);
    const taskId = asString(row.taskId, 160);
    const taskVersion = asString(row.taskVersion, 200);
    const type = row.type as RecoveryActionType;
    if (!actionId || !taskId || !taskVersion || !actionTypes.has(type)) return [];
    const reasonCodes = Array.isArray(row.reasonCodes) ? row.reasonCodes.filter((code): code is string => !!asString(code, 80)).slice(0, 20) : [];
    const classification = classifications.has(row.classification as RecoveryClassification) ? row.classification as RecoveryClassification : undefined;
    return [{ id: actionId, type, taskId, taskVersion, toDate: row.toDate == null ? null : asString(row.toDate, 10), reasonCodes, selected: row.selected === true, status: asString(row.status, 30) || "PROPOSED", classification }];
  }) : [];
  const range = raw.remainingCapacity && typeof raw.remainingCapacity === "object" ? raw.remainingCapacity as Record<string, unknown> : null;
  const min = Number(range?.min);
  const max = Number(range?.max);
  if (!id || (status !== "ACTIVE" && status !== "PARTIALLY_APPLIED") || !actions.length) return null;
  if (range && (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min)) return null;
  return {
    id,
    status,
    backlogCount: Math.max(0, Number(raw.backlogCount) || 0),
    overdueCount: Math.max(0, Number(raw.overdueCount) || 0),
    urgentCount: Math.max(0, Number(raw.urgentCount) || 0),
    flexibleCount: Math.max(0, Number(raw.flexibleCount) || 0),
    staleCount: Math.max(0, Number(raw.staleCount) || 0),
    remainingCapacity: range ? { min, max } : null,
    restartTaskId: raw.restartTaskId == null ? null : asString(raw.restartTaskId, 160),
    reversibleUntil: raw.reversibleUntil == null ? null : asString(raw.reversibleUntil, 80),
    downstreamInvalidationId: raw.downstreamInvalidationId == null ? null : asString(raw.downstreamInvalidationId, 180),
    actions,
  };
}

export function parseRecoveryResponse(payload: unknown): ParsedRecoveryResponse {
  if (!payload || typeof payload !== "object") return { kind: "invalid" };
  const raw = payload as Record<string, unknown>;
  if (raw.ok !== true) return { kind: "invalid" };
  if (raw.session == null && raw.empty === true) return { kind: "empty" };
  const session = parseSession(raw.session);
  return session ? { kind: "session", session } : { kind: "invalid" };
}

function element(documentRef: Document, id: string) {
  return documentRef.getElementById(id) as HTMLElement | null;
}

function humanizeReason(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

export function createDashboardRecovery(options: Options) {
  const documentRef = options.documentRef ?? document;
  const windowRef = options.windowRef ?? window;
  const fetchImpl = options.fetchImpl ?? windowRef.fetch.bind(windowRef);
  const card = element(documentRef, "dashboardRecoveryCard");
  let session: RecoverySession | null = null;
  let abortController: AbortController | null = null;
  let previouslyFocusedElement: HTMLElement | null = null;
  let keydownHandler: ((event: KeyboardEvent) => void) | null = null;

  function telemetry(stage: Parameters<typeof trackRecovery>[0], input: Parameters<typeof trackRecovery>[1] = {}) {
    void trackRecovery(stage, input).catch(() => {});
  }

  function sessionTelemetry(current: RecoverySession) {
    return { backlogCount: current.backlogCount, overdueCount: current.overdueCount, urgentCount: current.urgentCount, flexibleCount: current.flexibleCount, actionCount: current.actions.length, capacityMax: current.remainingCapacity?.max };
  }

  function setState(state: "idle" | "loading" | "ready" | "empty" | "error", message: string) {
    card?.setAttribute("data-recovery-state", state);
    const status = element(documentRef, "dashboardRecoveryStatus");
    if (status) status.textContent = message;
    const retry = card?.querySelector<HTMLButtonElement>('[data-recovery="refresh"]');
    if (retry) retry.disabled = state === "loading";
    const retryButton = element(documentRef, "dashboardRecoveryRetry");
    if (retryButton) retryButton.hidden = state !== "error";
    const summary = element(documentRef, "dashboardRecoverySummary");
    if (summary) summary.hidden = state !== "ready";
  }

  function taskLabel(taskId: string) {
    const task = options.getTasks().find((candidate) => String(candidate.id || "") === taskId);
    return String((task as (Task & { name?: string; title?: string }) | undefined)?.name || (task as (Task & { title?: string }) | undefined)?.title || `Task ${taskId}`).trim();
  }

  function actionLabel(action: RecoveryAction) {
    const title = taskLabel(action.taskId);
    if (action.type === "DEFER_TO_LATER_DAY") return `${title} — move to ${action.toDate || "a later day"}`;
    if (action.type === "REMOVE_FROM_TODAY") return `${title} — remove from today`;
    if (action.type === "CLARIFY_TASK") return `${title} — needs clarification`;
    if (action.type === "MARK_FOR_LATER_REVIEW") return `${title} — review later`;
    if (action.type === "REVIEW_DEADLINE") return `${title} — review deadline`;
    return title;
  }

  function renderSummary() {
    if (!session) return;
    const title = element(documentRef, "dashboardRecoverySummaryTitle");
    if (title) title.textContent = `${session.backlogCount} task${session.backlogCount === 1 ? "" : "s"} carried over`;
    const details = element(documentRef, "dashboardRecoverySummaryDetails");
    if (details) details.textContent = `${session.urgentCount} need attention soon${session.remainingCapacity ? `; ${session.remainingCapacity.min}-${session.remainingCapacity.max} min remaining` : ""}.`;
  }

  function renderActionList(targetId: string, actions: RecoveryAction[]) {
    const list = element(documentRef, targetId);
    if (!list) return;
    list.replaceChildren();
    actions.slice(0, 3).forEach((action) => {
      const row = documentRef.createElement("div");
      row.className = "dashboardRecoveryAction";
      const label = documentRef.createElement("label");
      label.className = "chkRow";
      const checkbox = documentRef.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = action.selected;
      checkbox.disabled = action.status !== "PROPOSED" || action.type === "KEEP_ACTIVE" || action.type === "CLARIFY_TASK";
      checkbox.setAttribute("data-recovery-action-id", action.id);
      checkbox.setAttribute("aria-label", `Select ${actionLabel(action)}`);
      const copy = documentRef.createElement("span");
      copy.className = "dashboardRecoveryActionCopy";
      const heading = documentRef.createElement("strong");
      heading.textContent = actionLabel(action);
      const reason = documentRef.createElement("span");
      reason.className = "modalDropdownHelp";
      reason.textContent = action.reasonCodes.map(humanizeReason).join("; ") || "Review this task";
      copy.append(heading, reason);
      label.append(checkbox, copy);
      row.appendChild(label);
      if (action.type === "CLARIFY_TASK") {
        const clarify = documentRef.createElement("button");
        clarify.className = "btn btn-ghost";
        clarify.type = "button";
        clarify.textContent = "Clarify task";
        clarify.setAttribute("data-recovery-action", "clarify");
        clarify.setAttribute("data-recovery-task-id", action.taskId);
        row.appendChild(clarify);
      }
      list.appendChild(row);
    });
  }

  function render() {
    if (!session) return;
    const restart = element(documentRef, "dashboardRecoveryRestart");
    if (restart) {
      restart.replaceChildren();
      const restartAction = session.restartTaskId ? session.actions.find((action) => action.taskId === session?.restartTaskId) : null;
      if (restartAction) {
        const row = documentRef.createElement("div");
        row.className = "dashboardRecoveryRestartRow";
        const title = documentRef.createElement("strong");
        title.textContent = actionLabel(restartAction);
        const start = documentRef.createElement("button");
        start.className = "btn btn-accent";
        start.type = "button";
        start.textContent = "Start task";
        start.setAttribute("data-recovery-action", "start");
        start.setAttribute("data-recovery-task-id", restartAction.taskId);
        row.append(title, start);
        restart.appendChild(row);
      } else restart.textContent = "Choose one small action to get moving again.";
    }
    const attention = session.actions.filter((action) => action.classification === "URGENT" || action.classification === "IMPORTANT" || (!action.classification && action.type === "KEEP_ACTIVE"));
    const flexible = session.actions.filter((action) => action.classification === "FLEXIBLE" || action.classification === "STALE" || action.classification === "UNCLEAR" || action.type === "DEFER_TO_LATER_DAY" || action.type === "MARK_FOR_LATER_REVIEW");
    renderActionList("dashboardRecoveryAttentionList", attention);
    renderActionList("dashboardRecoveryFlexibleList", flexible);
    const undo = documentRef.querySelector<HTMLButtonElement>('[data-recovery="undo"]');
    if (undo) undo.hidden = !session.reversibleUntil || Date.parse(session.reversibleUntil) <= Date.now();
  }

  function setOverlay(open: boolean) {
    const overlay = element(documentRef, "dashboardRecoveryOverlay");
    if (!overlay) return;
    overlay.style.display = open ? "flex" : "none";
    overlay.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      previouslyFocusedElement = documentRef.activeElement instanceof HTMLElement ? documentRef.activeElement : null;
      render();
      documentRef.querySelector<HTMLElement>('#dashboardRecoveryOverlay [data-recovery="close"]')?.focus({ preventScroll: true });
    } else {
      previouslyFocusedElement?.focus({ preventScroll: true });
      previouslyFocusedElement = null;
    }
  }

  async function getIdToken() {
    return options.getIdToken ? options.getIdToken() : getFirebaseAuthClient()?.currentUser?.getIdToken() ?? null;
  }

  async function refresh(forceRefresh = false, userRequested = false) {
    if (!card || options.getCurrentAppPage() !== "dashboard") return;
    abortController?.abort();
    abortController = new AbortController();
    setState("loading", "Checking whether Recovery Mode can help...");
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const response = await fetchImpl(getApiUrl("/api/executive-function/recovery"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-firebase-auth": idToken },
        body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", forceRefresh, userRequested }),
        signal: abortController.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(asString((payload as Record<string, unknown>).error, 240) || "Could not prepare Recovery Mode.");
      const parsed = parseRecoveryResponse(payload);
      if (parsed.kind === "session") {
        const hadSession = Boolean(session);
        session = parsed.session;
        renderSummary();
        setState("ready", "Recovery Mode is ready for review.");
        telemetry(userRequested || !hadSession ? "opened" : "offered", sessionTelemetry(session));
        if (userRequested) setOverlay(true);
      } else if (parsed.kind === "empty") {
        session = null;
        setState("empty", userRequested ? "Your current plan does not need a recovery reset." : "Recovery Mode is available whenever your plan needs a reset.");
      } else throw new Error("The Recovery Mode response was invalid.");
    } catch (error) {
      if (abortController.signal.aborted) return;
      session = null;
      const message = error instanceof Error ? error.message : "Could not prepare Recovery Mode.";
      setState("error", message);
      telemetry(message.includes("expired") ? "expired" : message.includes("stale") ? "stale" : "failed", { errorCategory: message });
    }
  }

  async function dismiss() {
    if (!session) return;
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const response = await fetchImpl(getApiUrl(`/api/executive-function/recovery/${encodeURIComponent(session.id)}/dismiss`), { method: "POST", headers: { "Content-Type": "application/json", "x-firebase-auth": idToken }, body: "{}" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(asString((payload as Record<string, unknown>).error, 240) || "Could not dismiss Recovery Mode.");
      setOverlay(false);
      session = null;
      setState("empty", "Recovery Mode dismissed for now.");
      telemetry("dismissed");
    } catch (error) {
      const status = element(documentRef, "dashboardRecoveryModalStatus");
      if (status) status.textContent = error instanceof Error ? error.message : "Could not dismiss Recovery Mode.";
    }
  }

  async function apply() {
    if (!session) return;
    const selectedActions = session.actions.filter((action) => action.selected && action.status === "PROPOSED");
    const status = element(documentRef, "dashboardRecoveryModalStatus");
    if (!selectedActions.length) {
      if (status) status.textContent = "Select at least one suggested change before applying.";
      return;
    }
    telemetry("action_selected", { ...sessionTelemetry(session), selectedCount: selectedActions.length });
    const button = documentRef.querySelector<HTMLButtonElement>('[data-recovery="apply"]');
    if (button) button.disabled = true;
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const idempotencyKey = typeof windowRef.crypto?.randomUUID === "function" ? windowRef.crypto.randomUUID() : `recovery-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const response = await fetchImpl(getApiUrl(`/api/executive-function/recovery/${encodeURIComponent(session.id)}/apply`), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-firebase-auth": idToken },
        body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", idempotencyKey, actions: session.actions.map((action) => ({ id: action.id, selected: action.selected, toDate: action.toDate })) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(asString((payload as Record<string, unknown>).error, 240) || "The Recovery Mode changes could not be applied.");
      const parsed = parseRecoveryResponse(payload);
      if (parsed.kind !== "session") throw new Error("The Recovery Mode apply response was invalid.");
      session = parsed.session;
      render();
      const results = Array.isArray((payload as Record<string, unknown>).results) ? (payload as Record<string, unknown>).results as Array<Record<string, unknown>> : [];
      const applied = results.filter((result) => result.outcome === "APPLIED").length;
      const stale = results.filter((result) => result.outcome === "STALE").length;
      if (status) status.textContent = `${applied} change${applied === 1 ? "" : "s"} applied${stale ? `; ${stale} became stale` : ""}. Remaining tasks can wait for later review.`;
      setState("ready", stale ? "Some Recovery Mode changes became stale." : "Selected Recovery Mode changes applied.");
      telemetry(stale ? "partially_applied" : "actions_applied", { ...sessionTelemetry(session), selectedCount: selectedActions.length, appliedCount: applied, staleCount: stale });
      windowRef.dispatchEvent(new CustomEvent("tasklaunch:recovery-applied", { detail: { recoveryId: session.id, results, invalidationId: (session as RecoverySession & { downstreamInvalidationId?: string | null }).downstreamInvalidationId || null } }));
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "The Recovery Mode changes could not be applied.";
      telemetry("failed", { errorCategory: error instanceof Error ? error.message : "apply_failed" });
      if (button) button.disabled = false;
    }
  }

  async function undo() {
    if (!session) return;
    const button = documentRef.querySelector<HTMLButtonElement>('[data-recovery="undo"]');
    if (button) button.disabled = true;
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const idempotencyKey = typeof windowRef.crypto?.randomUUID === "function" ? windowRef.crypto.randomUUID() : `recovery-undo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const response = await fetchImpl(getApiUrl(`/api/executive-function/recovery/${encodeURIComponent(session.id)}/undo`), { method: "POST", headers: { "Content-Type": "application/json", "x-firebase-auth": idToken }, body: JSON.stringify({ idempotencyKey }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(asString((payload as Record<string, unknown>).error, 240) || "The Recovery Mode changes could not be undone.");
      const parsed = parseRecoveryResponse(payload);
      if (parsed.kind !== "session") throw new Error("The Recovery Mode undo response was invalid.");
      session = parsed.session;
      render();
      const status = element(documentRef, "dashboardRecoveryModalStatus");
      if (status) status.textContent = "Applied Recovery Mode changes were undone. Later edits were left untouched.";
      windowRef.dispatchEvent(new CustomEvent("tasklaunch:recovery-undone", { detail: { recoveryId: session.id, results: (payload as Record<string, unknown>).results || [] } }));
    } catch (error) {
      const status = element(documentRef, "dashboardRecoveryModalStatus");
      if (status) status.textContent = error instanceof Error ? error.message : "The Recovery Mode changes could not be undone.";
      telemetry("failed", { errorCategory: error instanceof Error ? error.message : "undo_failed" });
      if (button) button.disabled = false;
    }
  }

  async function complete() {
    if (!session) return;
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const response = await fetchImpl(getApiUrl(`/api/executive-function/recovery/${encodeURIComponent(session.id)}/complete`), { method: "POST", headers: { "Content-Type": "application/json", "x-firebase-auth": idToken }, body: "{}" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(asString((payload as Record<string, unknown>).error, 240) || "Could not finish Recovery Mode.");
      setOverlay(false);
      session = null;
      setState("empty", "Recovery complete. Your current plan has not been changed.");
      telemetry("completed");
    } catch (error) {
      const status = element(documentRef, "dashboardRecoveryModalStatus");
      if (status) status.textContent = error instanceof Error ? error.message : "Could not finish Recovery Mode.";
    }
  }

  function register() {
    if (!card) return;
    documentRef.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-recovery]");
      const actionTarget = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-recovery-action]");
      const action = target?.getAttribute("data-recovery") || actionTarget?.getAttribute("data-recovery-action");
      if (action === "open") {
        if (session) setOverlay(true);
        else void refresh(true, true);
      }
      if (action === "refresh") void refresh(true, false);
      if (action === "close") void dismiss();
      if (action === "dismiss") void dismiss();
      if (action === "apply") void apply();
      if (action === "undo") void undo();
      if (action === "clarify") {
        const taskId = asString(actionTarget?.getAttribute("data-recovery-task-id"), 160);
        if (taskId) {
          dispatchTaskClarificationOpenEvent({ taskId, title: taskLabel(taskId) });
          telemetry("clarification_opened");
        }
      }
      if (action === "complete") void complete();
      if (action === "start") {
        const taskId = asString(actionTarget?.getAttribute("data-recovery-task-id"), 160);
        setOverlay(false);
        if (taskId) {
          options.jumpToTaskById?.(taskId);
          telemetry("restart_started");
        }
      }
    });
    documentRef.addEventListener("change", (event) => {
      const target = (event.target as HTMLInputElement | null)?.closest<HTMLInputElement>("[data-recovery-action-id]");
      if (!target || !session) return;
      const action = session.actions.find((candidate) => candidate.id === target.getAttribute("data-recovery-action-id"));
      if (action) action.selected = target.checked;
    });
    windowRef.addEventListener("tasklaunch:app-page-changed", (event) => {
      if ((event as CustomEvent<{ page?: string }>).detail?.page === "dashboard") void refresh();
    });
    keydownHandler = (event) => { if (event.key === "Escape") setOverlay(false); };
    windowRef.addEventListener("keydown", keydownHandler);
    if (options.getCurrentAppPage() === "dashboard") void refresh();
  }

  function destroy() {
    abortController?.abort();
    if (keydownHandler) windowRef.removeEventListener("keydown", keydownHandler);
  }

  return { register, refresh, destroy, parseRecoveryResponse };
}
