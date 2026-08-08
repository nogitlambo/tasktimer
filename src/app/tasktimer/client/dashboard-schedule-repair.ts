import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { dispatchTaskClarificationOpenEvent } from "./task-clarification-events";
import { trackScheduleRepair } from "@/app/schedulerepair/lib/scheduleRepairTelemetry";

import { getApiUrl } from "../lib/apiClient";

type RepairAction = {
  id: string;
  type: string;
  taskId: string;
  taskVersion: string;
  fromDate?: string | null;
  toDate?: string | null;
  fromMinutes?: number | null;
  toMinutes?: number | null;
  reasonCodes: string[];
  selected: boolean;
  status: string;
};

export type ScheduleRepairDashboardProposal = {
  id: string;
  localDate: string;
  planHealthBefore: string;
  remainingPlannedMinutesBefore: number;
  estimatedPlannedMinutesAfter: number;
  remainingCapacity: { min: number; max: number };
  expiresAt: string;
  status: string;
  reversibleUntil: string | null;
  actions: RepairAction[];
};

type ParsedResponse = { kind: "proposal"; proposal: ScheduleRepairDashboardProposal } | { kind: "none" | "invalid" };

function asString(value: unknown, maxLength = 240) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function asMinutes(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1440 ? value : null;
}

function asDate(value: unknown) {
  const date = asString(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export function parseScheduleRepairResponse(value: unknown): ParsedResponse {
  const root = value && typeof value === "object" ? value as Record<string, unknown> : null;
  if (!root || root.ok !== true) return { kind: "invalid" };
  const raw = root.proposal && typeof root.proposal === "object" ? root.proposal as Record<string, unknown> : null;
  if (!raw) return { kind: "none" };
  const id = asString(raw.id, 180);
  const localDate = asDate(raw.localDate);
  const planHealthBefore = asString(raw.planHealthBefore, 50);
  const remainingPlannedMinutesBefore = asMinutes(raw.remainingPlannedMinutesBefore);
  const estimatedPlannedMinutesAfter = asMinutes(raw.estimatedPlannedMinutesAfter);
  const expiresAt = asString(raw.expiresAt, 80);
  const expiresAtMs = Date.parse(expiresAt);
  const reversibleUntil = raw.reversibleUntil == null ? null : asString(raw.reversibleUntil, 80);
  const remaining = raw.remainingCapacity && typeof raw.remainingCapacity === "object" ? raw.remainingCapacity as Record<string, unknown> : null;
  const remainingMin = asMinutes(remaining?.min);
  const remainingMax = asMinutes(remaining?.max);
  const actions = Array.isArray(raw.actions) ? raw.actions.flatMap((value): RepairAction[] => {
    if (!value || typeof value !== "object") return [];
    const action = value as Record<string, unknown>;
    const actionId = asString(action.id, 180);
    const taskId = asString(action.taskId, 160);
    const taskVersion = asString(action.taskVersion, 200);
    const type = asString(action.type, 50);
    const reasonCodes = Array.isArray(action.reasonCodes) ? action.reasonCodes.filter((code): code is string => !!asString(code, 60)).slice(0, 20) : [];
    const fromMinutes = action.fromMinutes == null ? null : asMinutes(action.fromMinutes);
    const toMinutes = action.toMinutes == null ? null : asMinutes(action.toMinutes);
    if (!actionId || !taskId || !taskVersion || !type || !reasonCodes.length || (action.fromMinutes != null && fromMinutes == null) || (action.toMinutes != null && toMinutes == null)) return [];
    return [{
      id: actionId,
      type,
      taskId,
      taskVersion,
      fromDate: asDate(action.fromDate),
      toDate: asDate(action.toDate),
      fromMinutes,
      toMinutes,
      reasonCodes,
      selected: action.selected === true,
      status: asString(action.status, 30) || "PROPOSED",
    }];
  }).slice(0, 20) : [];
  if (!id || !localDate || !planHealthBefore || remainingPlannedMinutesBefore == null || estimatedPlannedMinutesAfter == null || remainingMin == null || remainingMax == null || remainingMin > remainingMax || !expiresAt || !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now() || !actions.length) return { kind: "none" };
  return { kind: "proposal", proposal: { id, localDate, planHealthBefore, remainingPlannedMinutesBefore, estimatedPlannedMinutesAfter, remainingCapacity: { min: remainingMin, max: remainingMax }, expiresAt, status: asString(raw.status, 30) || "ACTIVE", reversibleUntil, actions } };
}

function element(documentRef: Document, id: string) {
  return documentRef.getElementById(id) as HTMLElement | null;
}

type Options = { documentRef?: Document; windowRef?: Window; fetchImpl?: typeof fetch; getCurrentAppPage: () => string; getIdToken?: () => Promise<string | null> };

function actionLabel(action: RepairAction) {
  if (action.type === "MOVE_TO_LATER_DAY") return `Move task ${action.taskId} to ${action.toDate || "a later day"}`;
  if (action.type === "REMOVE_FROM_TODAY") return `Remove task ${action.taskId} from today`;
  if (action.type === "REDUCE_TODAY_TARGET") return `Reduce today's target for task ${action.taskId}`;
  if (action.type === "REVIEW_DEADLINE") return `Review the deadline for task ${action.taskId}`;
  if (action.type === "CLARIFY_TASK") return `Clarify task ${action.taskId}`;
  return `Keep task ${action.taskId} today`;
}

export function createDashboardScheduleRepair(options: Options) {
  const documentRef = options.documentRef ?? document;
  const windowRef = options.windowRef ?? window;
  const fetchImpl = options.fetchImpl ?? windowRef.fetch.bind(windowRef);
  const card = element(documentRef, "dashboardScheduleRepairCard");
  let proposal: ScheduleRepairDashboardProposal | null = null;
  let abortController: AbortController | null = null;
  let previouslyFocusedElement: HTMLElement | null = null;
  let keydownHandler: ((event: KeyboardEvent) => void) | null = null;

  function setState(state: "loading" | "ready" | "empty" | "error", message: string) {
    card?.setAttribute("data-schedule-repair-state", state);
    const status = element(documentRef, "dashboardScheduleRepairStatus");
    if (status) status.textContent = message;
    const retry = documentRef.querySelector<HTMLButtonElement>('[data-schedule-repair="refresh"]');
    if (retry) retry.disabled = state === "loading";
    const review = documentRef.querySelector<HTMLButtonElement>('[data-schedule-repair="review"]');
    if (review) review.hidden = state !== "ready";
    const summary = element(documentRef, "dashboardScheduleRepairSummary");
    if (summary) summary.hidden = state !== "ready";
    const retryButton = element(documentRef, "dashboardScheduleRepairCard")?.querySelector<HTMLButtonElement>(".dashboardScheduleRepairRetry");
    if (retryButton) retryButton.hidden = state !== "error";
  }

  function renderSummary() {
    if (!proposal) return;
    const title = element(documentRef, "dashboardScheduleRepairSummaryTitle");
    if (title) title.textContent = `${proposal.actions.length} suggestions for an overloaded day`;
    const details = element(documentRef, "dashboardScheduleRepairSummaryDetails");
    if (details) details.textContent = `${proposal.remainingPlannedMinutesBefore}m planned, ${proposal.remainingCapacity.max}m upper capacity; review before applying.`;
  }

  function renderActions() {
    const list = element(documentRef, "dashboardScheduleRepairActionList");
    if (!list || !proposal) return;
    const localDate = proposal.localDate;
    list.replaceChildren();
    proposal.actions.forEach((action) => {
      const row = documentRef.createElement("div");
      row.className = "dashboardScheduleRepairAction";
      row.setAttribute("data-schedule-repair-action-id", action.id);
      const label = documentRef.createElement("label");
      label.className = "chkRow modalPreviewCheckboxRow";
      const checkbox = documentRef.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = action.type === "CLARIFY_TASK" ? false : action.selected;
      checkbox.disabled = action.type === "CLARIFY_TASK";
      checkbox.setAttribute("data-schedule-repair-field", "selected");
      checkbox.setAttribute("aria-label", `Select ${actionLabel(action)}`);
      const text = documentRef.createElement("span");
      text.className = "modalPreviewCheckboxText";
      const heading = documentRef.createElement("strong");
      heading.textContent = actionLabel(action);
      const reasons = documentRef.createElement("span");
      reasons.className = "modalDropdownHelp";
      reasons.textContent = action.reasonCodes.join("; ").replaceAll("_", " ").toLowerCase();
      text.append(heading, reasons);
      label.append(checkbox, text);
      row.appendChild(label);
      if (action.type === "CLARIFY_TASK") {
        const clarify = documentRef.createElement("button");
        clarify.className = "btn btn-ghost";
        clarify.type = "button";
        clarify.textContent = "Clarify task";
        clarify.setAttribute("data-schedule-repair-action", "clarify");
        clarify.setAttribute("data-schedule-repair-task-id", action.taskId);
        row.appendChild(clarify);
      }
      if (action.type === "MOVE_TO_LATER_DAY" || action.type === "REDUCE_TODAY_TARGET") {
        const field = documentRef.createElement("label");
        field.className = "field dashboardScheduleRepairEditField";
        field.textContent = action.type === "MOVE_TO_LATER_DAY" ? "Target day" : "Target minutes";
        const input = documentRef.createElement("input");
        input.type = action.type === "MOVE_TO_LATER_DAY" ? "date" : "number";
        input.min = action.type === "MOVE_TO_LATER_DAY" ? localDate : "1";
        input.max = action.type === "MOVE_TO_LATER_DAY" ? "" : "1440";
        input.step = "1";
        input.value = action.type === "MOVE_TO_LATER_DAY" ? action.toDate || "" : String(action.toMinutes ?? action.fromMinutes ?? "");
        input.setAttribute("data-schedule-repair-field", action.type === "MOVE_TO_LATER_DAY" ? "toDate" : "toMinutes");
        field.appendChild(input);
        row.appendChild(field);
      }
      list.appendChild(row);
    });
  }

  function syncUndoButton() {
    const undo = documentRef.querySelector<HTMLButtonElement>('[data-schedule-repair="undo"]');
    if (!undo) return;
    const reversible = !!proposal?.reversibleUntil && ["APPLIED", "PARTIALLY_APPLIED"].includes(proposal.status) && Date.parse(proposal.reversibleUntil) > Date.now();
    undo.hidden = !reversible;
  }

  function setOverlay(open: boolean) {
    const overlay = element(documentRef, "dashboardScheduleRepairOverlay");
    if (!overlay) return;
    overlay.style.display = open ? "flex" : "none";
    overlay.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      previouslyFocusedElement = documentRef.activeElement instanceof HTMLElement ? documentRef.activeElement : null;
      renderActions();
      documentRef.querySelector<HTMLElement>("#dashboardScheduleRepairActionList input")?.focus({ preventScroll: true });
    } else {
      previouslyFocusedElement?.focus({ preventScroll: true });
      previouslyFocusedElement = null;
    }
  }

  async function getIdToken() {
    return options.getIdToken ? options.getIdToken() : getFirebaseAuthClient()?.currentUser?.getIdToken() ?? null;
  }

  async function refresh(forceRefresh = true) {
    if (!card || options.getCurrentAppPage() !== "dashboard") return;
    abortController?.abort();
    abortController = new AbortController();
    setState("loading", "Checking today's schedule...");
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const response = await fetchImpl(getApiUrl("/api/executive-function/schedule-repair"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-firebase-auth": idToken },
        body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, forceRefresh }),
        signal: abortController.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(asString((payload as Record<string, unknown>).error) || "Could not check today's schedule.");
      const parsed = parseScheduleRepairResponse(payload);
      if (parsed.kind === "proposal") {
        proposal = parsed.proposal;
        renderSummary();
        setState("ready", "A schedule repair is ready for review.");
        void trackScheduleRepair(forceRefresh ? "refreshed" : "viewed", { actionCount: proposal.actions.length, planHealth: proposal.planHealthBefore });
      } else {
        proposal = null;
        setState("empty", "Today's schedule does not need repair.");
      }
    } catch (error) {
      if (abortController.signal.aborted) return;
      proposal = null;
      setState("error", error instanceof Error ? error.message : "Could not check today's schedule.");
      void trackScheduleRepair("failed", { errorCategory: error instanceof Error && error.message.toLowerCase().includes("sign-in") ? "unauthenticated" : "network" });
    }
  }

  async function dismiss() {
    if (!proposal) return;
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const response = await fetchImpl(getApiUrl(`/api/executive-function/schedule-repair/${encodeURIComponent(proposal.id)}/dismiss`), { method: "POST", headers: { "Content-Type": "application/json", "x-firebase-auth": idToken }, body: "{}" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(asString((payload as Record<string, unknown>).error) || "Could not dismiss this proposal.");
      proposal = null;
      setOverlay(false);
      setState("empty", "Schedule repair dismissed for now.");
      void trackScheduleRepair("dismissed");
    } catch (error) {
      const status = element(documentRef, "dashboardScheduleRepairModalStatus");
      if (status) status.textContent = error instanceof Error ? error.message : "Could not dismiss this proposal.";
    }
  }

  async function apply() {
    if (!proposal) return;
    const selectedActions = proposal.actions.filter((action) => action.selected && action.type !== "CLARIFY_TASK");
    const status = element(documentRef, "dashboardScheduleRepairModalStatus");
    if (!selectedActions.length) {
      if (status) status.textContent = "Select at least one suggestion before applying.";
      return;
    }
    const applyButton = documentRef.querySelector<HTMLButtonElement>('[data-schedule-repair="apply"]');
    if (applyButton) applyButton.disabled = true;
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const idempotencyKey = typeof windowRef.crypto?.randomUUID === "function" ? windowRef.crypto.randomUUID() : `repair-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const response = await fetchImpl(getApiUrl(`/api/executive-function/schedule-repair/${encodeURIComponent(proposal.id)}/apply`), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-firebase-auth": idToken },
        body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, idempotencyKey, actions: proposal.actions.map((action) => ({ id: action.id, selected: action.selected, toDate: action.toDate, toMinutes: action.toMinutes })) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(asString((payload as Record<string, unknown>).error) || "The schedule repair could not be applied.");
      const results = Array.isArray((payload as Record<string, unknown>).results) ? (payload as Record<string, unknown>).results as Array<Record<string, unknown>> : [];
      const appliedCount = results.filter((result) => result.outcome === "APPLIED").length;
      const staleCount = results.filter((result) => result.outcome === "STALE").length;
      if (status) status.textContent = staleCount ? `${appliedCount} suggestion${appliedCount === 1 ? "" : "s"} applied; ${staleCount} became stale. Refresh before trying again.` : `${appliedCount} suggestion${appliedCount === 1 ? "" : "s"} applied.`;
      const parsed = parseScheduleRepairResponse(payload);
      if (parsed.kind === "proposal") proposal = parsed.proposal;
      renderActions();
      syncUndoButton();
      if (applyButton) applyButton.disabled = true;
      setState("ready", staleCount ? "Some schedule repair suggestions are stale." : "Selected schedule repair actions applied.");
      void trackScheduleRepair("applied", { selectedCount: selectedActions.length, appliedCount, staleCount, outcome: staleCount ? "NO_SAFE_SOLUTION" : "REPAIR_REQUIRED" });
      windowRef.dispatchEvent(new CustomEvent("tasklaunch:schedule-repair-applied", { detail: { proposalId: proposal?.id, results } }));
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "The schedule repair could not be applied.";
      if (applyButton) applyButton.disabled = false;
    }
  }

  async function undo() {
    if (!proposal) return;
    const status = element(documentRef, "dashboardScheduleRepairModalStatus");
    const undoButton = documentRef.querySelector<HTMLButtonElement>('[data-schedule-repair="undo"]');
    if (undoButton) undoButton.disabled = true;
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const idempotencyKey = typeof windowRef.crypto?.randomUUID === "function" ? windowRef.crypto.randomUUID() : `undo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const response = await fetchImpl(getApiUrl(`/api/executive-function/schedule-repair/${encodeURIComponent(proposal.id)}/undo`), { method: "POST", headers: { "Content-Type": "application/json", "x-firebase-auth": idToken }, body: JSON.stringify({ idempotencyKey }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(asString((payload as Record<string, unknown>).error) || "The schedule repair could not be undone.");
      const results = Array.isArray((payload as Record<string, unknown>).results) ? (payload as Record<string, unknown>).results as Array<Record<string, unknown>> : [];
      const restoredCount = results.filter((result) => result.outcome === "APPLIED").length;
      if (status) status.textContent = `${restoredCount} applied change${restoredCount === 1 ? "" : "s"} restored.`;
      const parsed = parseScheduleRepairResponse(payload);
      if (parsed.kind === "proposal") proposal = parsed.proposal;
      renderActions();
      syncUndoButton();
      windowRef.dispatchEvent(new CustomEvent("tasklaunch:schedule-repair-undone", { detail: { proposalId: proposal?.id, results } }));
      void trackScheduleRepair("undone", { appliedCount: restoredCount, staleCount: results.filter((result) => result.outcome === "STALE").length });
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "The schedule repair could not be undone.";
      if (undoButton) undoButton.disabled = false;
    }
  }

  function updateDraft(target: HTMLElement) {
    if (!proposal) return;
    const row = target.closest<HTMLElement>("[data-schedule-repair-action-id]");
    const action = proposal.actions.find((candidate) => candidate.id === row?.getAttribute("data-schedule-repair-action-id"));
    if (!action) return;
    const field = target.getAttribute("data-schedule-repair-field");
    if (field === "selected" && target instanceof HTMLInputElement) action.selected = target.checked;
    if (field === "toDate" && target instanceof HTMLInputElement) action.toDate = asDate(target.value);
    if (field === "toMinutes" && target instanceof HTMLInputElement) action.toMinutes = asMinutes(Number(target.value));
  }

  function clarify(target: HTMLElement) {
    const taskId = asString(target.getAttribute("data-schedule-repair-task-id"), 160);
    if (!taskId) return;
    dispatchTaskClarificationOpenEvent({ taskId, title: `Task ${taskId}` });
    void trackScheduleRepair("clarification_opened");
  }

  function register() {
    if (!card) return;
    documentRef.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-schedule-repair]");
      const actionTarget = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-schedule-repair-action]");
      const action = target?.getAttribute("data-schedule-repair") || actionTarget?.getAttribute("data-schedule-repair-action");
      if (action === "review") setOverlay(true);
      if (action === "close") setOverlay(false);
      if (action === "refresh") void refresh(true);
      if (action === "dismiss") void dismiss();
      if (action === "apply") void apply();
      if (action === "undo") void undo();
      if (action === "clarify") clarify(actionTarget || (event.target as HTMLElement));
    });
    documentRef.addEventListener("change", (event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-schedule-repair-field]");
      if (target) updateDraft(target);
    });
    windowRef.addEventListener("tasklaunch:app-page-changed", (event) => { if ((event as CustomEvent<{ page?: string }>).detail?.page === "dashboard") void refresh(false); });
    keydownHandler = (event) => { if (event.key === "Escape") setOverlay(false); };
    windowRef.addEventListener("keydown", keydownHandler);
    windowRef.addEventListener("tasklaunch:recovery-applied", () => { if (options.getCurrentAppPage() === "dashboard") void refresh(true); });
    windowRef.addEventListener("tasklaunch:recovery-undone", () => { if (options.getCurrentAppPage() === "dashboard") void refresh(true); });
    if (options.getCurrentAppPage() === "dashboard") void refresh(false);
  }

  function destroy() {
    abortController?.abort();
    if (keydownHandler) windowRef.removeEventListener("keydown", keydownHandler);
  }

  return { register, refresh, destroy, parseScheduleRepairResponse };
}
