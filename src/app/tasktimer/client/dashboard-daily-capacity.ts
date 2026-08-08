import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { trackDailyCapacity } from "@/app/adaptivecapacity/lib/dailyCapacityTelemetry";

import { getApiUrl } from "../lib/apiClient";

type DailyCapacityState = "REDUCED" | "LIGHT" | "STANDARD" | "STRONG" | "USER_DEFINED" | "INSUFFICIENT_DATA";
type DailyCapacityConfidence = "LOW" | "MEDIUM" | "HIGH";
type DailyCapacityPrimarySource = "USER_CUSTOM" | "USER_STATE" | "WEEKDAY_HISTORY" | "ROLLING_HISTORY" | "DEFAULT";
type DailyCapacityReasonCode =
  | "USER_OVERRIDE"
  | "CUSTOM_MINUTES"
  | "FOCUS_WINDOW_REMAINING"
  | "SCHEDULE_AVAILABILITY"
  | "WEEKDAY_HISTORY"
  | "ROLLING_HISTORY"
  | "TODAY_COMPLETED_WORK"
  | "DEFAULT_BASELINE"
  | "AVAILABLE_TIME_CAP"
  | "INSUFFICIENT_HISTORY"
  | "HIGH_VARIANCE";

export type DailyCapacityDashboardSnapshot = {
  localDate: string;
  remainingRange: { min: number; max: number };
  state: DailyCapacityState;
  confidence: DailyCapacityConfidence;
  primarySource: DailyCapacityPrimarySource;
  sourceSignals: DailyCapacityReasonCode[];
  availableMinutesCeiling: number | null;
  completedMinutesToday: number;
  manualOverride: { type: "STATE" | "MINUTES"; state?: DailyCapacityState; minutes?: number } | null;
};

type ParsedCapacityResponse = { kind: "capacity"; capacity: DailyCapacityDashboardSnapshot } | { kind: "invalid" };

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function parseRange(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const min = Number(row.min);
  const max = Number(row.max);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min || max > 1440) return null;
  return { min, max };
}

const states = new Set<DailyCapacityState>(["REDUCED", "LIGHT", "STANDARD", "STRONG", "USER_DEFINED", "INSUFFICIENT_DATA"]);
const confidences = new Set<DailyCapacityConfidence>(["LOW", "MEDIUM", "HIGH"]);
const sources = new Set<DailyCapacityPrimarySource>(["USER_CUSTOM", "USER_STATE", "WEEKDAY_HISTORY", "ROLLING_HISTORY", "DEFAULT"]);
const reasons = new Set<DailyCapacityReasonCode>([
  "USER_OVERRIDE", "CUSTOM_MINUTES", "FOCUS_WINDOW_REMAINING", "SCHEDULE_AVAILABILITY", "WEEKDAY_HISTORY", "ROLLING_HISTORY",
  "TODAY_COMPLETED_WORK", "DEFAULT_BASELINE", "AVAILABLE_TIME_CAP", "INSUFFICIENT_HISTORY", "HIGH_VARIANCE",
]);

export function parseDailyCapacityResponse(payload: unknown): ParsedCapacityResponse {
  if (!payload || typeof payload !== "object") return { kind: "invalid" };
  const raw = payload as Record<string, unknown>;
  if (raw.ok !== true || !raw.snapshot || typeof raw.snapshot !== "object") return { kind: "invalid" };
  const snapshot = raw.snapshot as Record<string, unknown>;
  const remainingRange = parseRange(snapshot.remainingRange);
  const sourceSignals = Array.isArray(snapshot.sourceSignals)
    ? snapshot.sourceSignals.filter((value): value is DailyCapacityReasonCode => reasons.has(value as DailyCapacityReasonCode)).slice(0, 20)
    : [];
  const localDate = asString(snapshot.localDate, 10);
  const completedMinutesToday = Number(snapshot.completedMinutesToday);
  const ceiling = snapshot.availableMinutesCeiling == null ? null : Number(snapshot.availableMinutesCeiling);
  const rawOverride = snapshot.manualOverride;
  const manualOverride = rawOverride && typeof rawOverride === "object"
    ? {
        type: (rawOverride as Record<string, unknown>).type as "STATE" | "MINUTES",
        state: (rawOverride as Record<string, unknown>).state as DailyCapacityState | undefined,
        minutes: Number.isInteger(Number((rawOverride as Record<string, unknown>).minutes)) ? Number((rawOverride as Record<string, unknown>).minutes) : undefined,
      }
    : null;
  const state = snapshot.state as DailyCapacityState;
  const confidence = snapshot.confidence as DailyCapacityConfidence;
  const primarySource = snapshot.primarySource as DailyCapacityPrimarySource;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !remainingRange || !states.has(state) || !confidences.has(confidence) || !sources.has(primarySource)) return { kind: "invalid" };
  if (!Number.isInteger(completedMinutesToday) || completedMinutesToday < 0 || completedMinutesToday > 1440) return { kind: "invalid" };
  if (ceiling != null && (!Number.isInteger(ceiling) || ceiling < 1 || ceiling > 1440)) return { kind: "invalid" };
  if (manualOverride && manualOverride.type !== "STATE" && manualOverride.type !== "MINUTES") return { kind: "invalid" };
  return {
    kind: "capacity",
    capacity: { localDate, remainingRange, state, confidence, primarySource, sourceSignals, availableMinutesCeiling: ceiling, completedMinutesToday, manualOverride },
  };
}

function element(documentRef: Document, id: string) {
  return documentRef.getElementById(id) as HTMLElement | null;
}

type Options = { documentRef?: Document; windowRef?: Window; fetchImpl?: typeof fetch; getCurrentAppPage: () => string; getIdToken?: () => Promise<string | null> };

export function createDashboardDailyCapacity(options: Options) {
  const documentRef = options.documentRef ?? document;
  const windowRef = options.windowRef ?? window;
  const fetchImpl = options.fetchImpl ?? windowRef.fetch.bind(windowRef);
  const card = element(documentRef, "dashboardDailyCapacityCard");
  let abortController: AbortController | null = null;
  let currentCapacity: DailyCapacityDashboardSnapshot | null = null;
  let hasViewed = false;
  let previouslyFocusedElement: HTMLElement | null = null;
  let keydownHandler: ((event: KeyboardEvent) => void) | null = null;

  function telemetry(stage: Parameters<typeof trackDailyCapacity>[0], input: Parameters<typeof trackDailyCapacity>[1] = {}) {
    void trackDailyCapacity(stage, input).catch(() => {});
  }

  function capacityTelemetry(capacity: DailyCapacityDashboardSnapshot) {
    return {
      state: capacity.state,
      confidence: capacity.confidence,
      primarySource: capacity.primarySource,
      sourceSignals: capacity.sourceSignals,
      overrideType: capacity.manualOverride?.type,
      remainingMin: capacity.remainingRange.min,
      remainingMax: capacity.remainingRange.max,
    };
  }

  function setState(state: "loading" | "ready" | "error", message: string) {
    card?.setAttribute("data-daily-capacity-state", state);
    const status = element(documentRef, "dashboardDailyCapacityStatus");
    if (status) status.textContent = message;
    const retry = element(documentRef, "dashboardDailyCapacityRetry") as HTMLButtonElement | null;
    if (retry) retry.hidden = state !== "error";
  }

  function render(capacity: DailyCapacityDashboardSnapshot) {
    currentCapacity = capacity;
    const range = element(documentRef, "dashboardDailyCapacityRange");
    if (range) range.textContent = `${capacity.remainingRange.min}-${capacity.remainingRange.max} min remaining`;
    const state = element(documentRef, "dashboardDailyCapacityState");
    if (state) state.textContent = capacity.state.replaceAll("_", " ");
    const confidence = element(documentRef, "dashboardDailyCapacityConfidence");
    if (confidence) confidence.textContent = `Confidence: ${capacity.confidence.toLowerCase()}`;
    const explanation = element(documentRef, "dashboardDailyCapacityExplanation");
    if (explanation) {
      explanation.textContent = capacity.primarySource === "DEFAULT"
        ? "TaskLaunch will personalise this estimate as more session history becomes available."
        : "Based on your TaskLaunch work patterns and today's available time.";
    }
    setState("ready", capacity.manualOverride ? "Today's planning uses your adjustment." : "Today's capacity is ready.");
    telemetry(hasViewed ? "refreshed" : "viewed", capacityTelemetry(capacity));
    if (capacity.primarySource === "DEFAULT" && capacity.sourceSignals.includes("INSUFFICIENT_HISTORY")) telemetry("insufficient_history", capacityTelemetry(capacity));
    hasViewed = true;
  }

  function setAdjustError(message = "") {
    const error = element(documentRef, "dashboardDailyCapacityAdjustError");
    if (!error) return;
    error.textContent = message;
    error.hidden = !message;
  }

  function setOverlay(open: boolean) {
    const overlay = element(documentRef, "dashboardDailyCapacityAdjustOverlay");
    if (!overlay) return;
    overlay.style.display = open ? "flex" : "none";
    overlay.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      previouslyFocusedElement = documentRef.activeElement instanceof HTMLElement ? documentRef.activeElement : null;
      const override = currentCapacity?.manualOverride;
      const selectedState = override?.type === "STATE" ? override.state : currentCapacity?.state;
      documentRef.querySelectorAll<HTMLElement>("[data-daily-capacity-state-option]").forEach((button) => {
        const selected = button.getAttribute("data-daily-capacity-state-option") === selectedState;
        button.setAttribute("aria-pressed", String(selected));
      });
      const input = element(documentRef, "dashboardDailyCapacityCustomMinutesInput") as HTMLInputElement | null;
      if (input) input.value = override?.type === "MINUTES" && override.minutes ? String(override.minutes) : "";
      setAdjustError();
      documentRef.querySelector<HTMLElement>("[data-daily-capacity-state-option]")?.focus({ preventScroll: true });
    } else {
      previouslyFocusedElement?.focus({ preventScroll: true });
      previouslyFocusedElement = null;
    }
  }

  async function getIdToken() {
    return options.getIdToken ? options.getIdToken() : getFirebaseAuthClient()?.currentUser?.getIdToken() ?? null;
  }

  async function refresh(forceRefresh = false) {
    if (!card || options.getCurrentAppPage() !== "dashboard") return;
    abortController?.abort();
    abortController = new AbortController();
    setState("loading", "Loading today's capacity...");
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const timezone = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
      const forceQuery = forceRefresh ? "&forceRefresh=true" : "";
      const response = await fetchImpl(getApiUrl(`/api/executive-function/capacity/today?timezone=${timezone}${forceQuery}`), { headers: { "x-firebase-auth": idToken }, signal: abortController.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(asString((payload as Record<string, unknown>).error, 240) || "Could not load today's capacity.");
      const parsed = parseDailyCapacityResponse(payload);
      if (parsed.kind !== "capacity") throw new Error("The capacity response was invalid.");
      render(parsed.capacity);
    } catch (error) {
      if (abortController.signal.aborted) return;
      setState("error", error instanceof Error ? error.message : "Using the standard planning range today.");
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      telemetry("failed", { errorCategory: message.includes("sign-in") ? "unauthenticated" : message.includes("invalid") ? "invalid_response" : "network" });
    }
  }

  async function updateOverride(method: "POST" | "DELETE") {
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const input = element(documentRef, "dashboardDailyCapacityCustomMinutesInput") as HTMLInputElement | null;
      const selected = documentRef.querySelector<HTMLElement>('[data-daily-capacity-state-option][aria-pressed="true"]')?.getAttribute("data-daily-capacity-state-option") || "STANDARD";
      const body = method === "POST"
        ? input?.value.trim()
          ? { type: "MINUTES", minutes: Number(input.value) }
          : { type: "STATE", state: selected }
        : undefined;
      const timezone = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
      const response = await fetchImpl(getApiUrl(`/api/executive-function/capacity/today/override?timezone=${timezone}`), {
        method,
        headers: { "Content-Type": "application/json", "x-firebase-auth": idToken },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(asString((payload as Record<string, unknown>).error, 240) || "Could not update today's capacity.");
      const parsed = parseDailyCapacityResponse(payload);
      if (parsed.kind !== "capacity") throw new Error("The capacity response was invalid.");
      setOverlay(false);
      render(parsed.capacity);
      telemetry(method === "POST" ? "override_set" : "override_cleared", { ...capacityTelemetry(parsed.capacity), overrideType: method === "POST" ? parsed.capacity.manualOverride?.type : undefined });
    } catch (error) {
      setAdjustError(error instanceof Error ? error.message : "Could not update today's capacity.");
    }
  }

  function register() {
    if (!card) return;
    documentRef.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-daily-capacity]");
      const action = target?.getAttribute("data-daily-capacity");
      if (action === "refresh") void refresh(true);
      if (action === "adjust") {
        setOverlay(true);
        telemetry("override_opened", currentCapacity ? capacityTelemetry(currentCapacity) : {});
      }
      if (action === "apply") void updateOverride("POST");
      if (action === "clear") void updateOverride("DELETE");
      if (action === "close") setOverlay(false);
      const stateOption = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-daily-capacity-state-option]");
      if (stateOption) {
        documentRef.querySelectorAll<HTMLElement>("[data-daily-capacity-state-option]").forEach((button) => button.setAttribute("aria-pressed", String(button === stateOption)));
        const input = element(documentRef, "dashboardDailyCapacityCustomMinutesInput") as HTMLInputElement | null;
        if (input) input.value = "";
      }
    });
    windowRef.addEventListener("tasklaunch:app-page-changed", (event) => {
      if ((event as CustomEvent<{ page?: string }>).detail?.page === "dashboard") void refresh();
    });
    windowRef.addEventListener("tasklaunch:capacity-source-changed", () => {
      telemetry("source_changed");
      void refresh(true);
    });
    windowRef.addEventListener("tasktimer:settings-optimal-productivity-days-change", () => {
      telemetry("source_changed");
      void refresh(true);
    });
    windowRef.addEventListener("tasktimer:settings-optimal-productivity-period-change", () => {
      telemetry("source_changed");
      void refresh(true);
    });
    windowRef.addEventListener("tasklaunch:recovery-applied", () => { if (options.getCurrentAppPage() === "dashboard") void refresh(true); });
    windowRef.addEventListener("tasklaunch:recovery-undone", () => { if (options.getCurrentAppPage() === "dashboard") void refresh(true); });
    keydownHandler = (event) => {
      if (event.key === "Escape") setOverlay(false);
    };
    windowRef.addEventListener("keydown", keydownHandler);
    if (options.getCurrentAppPage() === "dashboard") void refresh();
  }

  function destroy() {
    abortController?.abort();
    if (keydownHandler) windowRef.removeEventListener("keydown", keydownHandler);
  }

  return { register, refresh, destroy, parseDailyCapacityResponse };
}
