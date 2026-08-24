"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import AppImg from "@/components/AppImg";
import BrainDumpClient from "@/app/brain-dump/BrainDumpClient";
import { trackEvent } from "@/lib/firebaseTelemetry";
import NativePlusUpsellModal from "./NativePlusUpsellModal";
import { useNativePlusUpsell } from "./useNativePlusUpsell";
import {
  hasTaskTimerEntitlement,
  readTaskTimerPlanFromStorage,
  TASKTIMER_PLAN_CHANGED_EVENT,
} from "../lib/entitlements";
import { resolveTaskTimerRouteHref } from "../lib/routeHref";
import { STORAGE_KEY } from "../lib/storage";
import { playTaskFlipClickAudio } from "../client/secondary-click-audio";

type Props = { active: boolean };

export const EXECUTIVE_PAGE_REFRESH_COOLDOWN_MS = 60_000;
const EXECUTIVE_PAGE_REFRESH_AT_KEY = `${STORAGE_KEY}:executivePageRefreshAtMs`;

export function getExecutivePageRefreshRemainingMs(
  lastRefreshAtMs: number,
  nowMs: number,
) {
  return Math.max(
    0,
    lastRefreshAtMs + EXECUTIVE_PAGE_REFRESH_COOLDOWN_MS - nowMs,
  );
}

function DailyCapacityAdjustOverlay() {
  return (
    <div
      className="overlay primitiveSciFiModalOverlay dashboardDailyCapacityAdjustPrimitiveOverlay"
      id="dashboardDailyCapacityAdjustOverlay"
      style={{ display: "none" }}
      aria-hidden="true"
    >
      <div
        className="modal dashboardDailyCapacityAdjustPrimitiveModal modalConfirmation"
        role="dialog"
        aria-modal="true"
        aria-label="Adjust today's capacity"
        aria-describedby="dashboardDailyCapacityAdjustDescription"
      >
        <h2 className="modalTitle dashboardDailyCapacityAdjustPrimitiveHeader">
          Adjust today&apos;s capacity
        </h2>
        <div className="dashboardDailyCapacityAdjustPrimitiveBody">
          <p
            className="modalSubtext confirmText"
            id="dashboardDailyCapacityAdjustDescription"
          >
            How much can you realistically take on today?
          </p>
          <div
            className="dashboardDailyCapacityAdjustStates"
            role="group"
            aria-label="Capacity state"
          >
            <button
              className="btn btn-ghost primitiveSciFiModalAction primitiveSciFiModalSecondaryAction dashboardDailyCapacityAdjustPrimitiveAction dashboardDailyCapacityAdjustPrimitiveSecondaryAction"
              type="button"
              aria-pressed="false"
              data-daily-capacity-state-option="REDUCED"
            >
              Reduced
            </button>
            <button
              className="btn btn-ghost primitiveSciFiModalAction primitiveSciFiModalSecondaryAction dashboardDailyCapacityAdjustPrimitiveAction dashboardDailyCapacityAdjustPrimitiveSecondaryAction"
              type="button"
              aria-pressed="false"
              data-daily-capacity-state-option="LIGHT"
            >
              Light
            </button>
            <button
              className="btn btn-ghost primitiveSciFiModalAction primitiveSciFiModalSecondaryAction dashboardDailyCapacityAdjustPrimitiveAction dashboardDailyCapacityAdjustPrimitiveSecondaryAction"
              type="button"
              aria-pressed="false"
              data-daily-capacity-state-option="STANDARD"
            >
              Standard
            </button>
            <button
              className="btn btn-ghost primitiveSciFiModalAction primitiveSciFiModalSecondaryAction dashboardDailyCapacityAdjustPrimitiveAction dashboardDailyCapacityAdjustPrimitiveSecondaryAction"
              type="button"
              aria-pressed="false"
              data-daily-capacity-state-option="STRONG"
            >
              Strong
            </button>
          </div>
          <label
            className="dashboardDailyCapacityCustomMinutes"
            htmlFor="dashboardDailyCapacityCustomMinutesInput"
          >
            Custom time
            <input
              id="dashboardDailyCapacityCustomMinutesInput"
              type="number"
              min="1"
              max="1440"
              step="1"
              inputMode="numeric"
              placeholder="45"
            />
            <span>minutes</span>
          </label>
          <p className="modalDropdownHelp">
            This changes today&apos;s planning only and will not affect your
            history.
          </p>
          <p
            className="dashboardDailyCapacityAdjustError"
            id="dashboardDailyCapacityAdjustError"
            role="alert"
            hidden
          />
        </div>
        <div className="confirmBtns dashboardDailyCapacityAdjustPrimitiveFooter">
          <button
            className="btn btn-ghost modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction dashboardDailyCapacityAdjustPrimitiveAction dashboardDailyCapacityAdjustPrimitiveSecondaryAction"
            type="button"
            data-daily-capacity="close"
          >
            Cancel
          </button>
          <button
            className="btn btn-ghost modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction dashboardDailyCapacityAdjustPrimitiveAction dashboardDailyCapacityAdjustPrimitiveSecondaryAction"
            type="button"
            data-daily-capacity="clear"
          >
            Use estimate
          </button>
          <button
            className="btn btn-accent modalPreviewPrimaryAction primitiveSciFiModalAction primitiveSciFiModalPrimaryAction dashboardDailyCapacityAdjustPrimitiveAction dashboardDailyCapacityAdjustPrimitivePrimaryAction"
            type="button"
            data-daily-capacity="apply"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function ScheduleRepairOverlay() {
  return (
    <div
      className="overlay primitiveSciFiModalOverlay dashboardScheduleRepairPrimitiveOverlay"
      id="dashboardScheduleRepairOverlay"
      style={{ display: "none" }}
      aria-hidden="true"
    >
      <div
        className="modal dashboardScheduleRepairModal dashboardScheduleRepairPrimitiveModal modalConfirmation"
        role="dialog"
        aria-modal="true"
        aria-label="Review schedule repair"
        aria-describedby="dashboardScheduleRepairDescription"
      >
        <div
          className="dashboardScheduleRepairPrimitiveHeader"
        >
          <h2 className="modalTitle">Review schedule repair</h2>
        </div>
        <div className="dashboardScheduleRepairPrimitiveBody">
          <p className="modalSubtext confirmText" id="dashboardScheduleRepairDescription">
            Select the suggestions below that should be considered. Select
            Accept to apply the repair.
          </p>
          <div
            className="dashboardScheduleRepairModalStatus"
            id="dashboardScheduleRepairModalStatus"
            role="status"
            aria-live="polite"
          />
          <div
            className="dashboardScheduleRepairActionList"
            id="dashboardScheduleRepairActionList"
            aria-label="Proposed schedule repair actions"
          />
        </div>
        <div className="confirmBtns dashboardScheduleRepairActions dashboardScheduleRepairPrimitiveFooter">
          <p
            className="dashboardScheduleRepairFooterStatus"
            id="dashboardScheduleRepairFooterStatus"
            role="status"
            aria-live="polite"
            hidden
          />
          <button
            className="btn btn-ghost modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction dashboardScheduleRepairPrimitiveAction dashboardScheduleRepairPrimitiveSecondaryAction"
            type="button"
            data-schedule-repair="close"
          >
            Cancel
          </button>
          <button
            className="btn btn-ghost modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction dashboardScheduleRepairPrimitiveAction dashboardScheduleRepairPrimitiveSecondaryAction"
            type="button"
            data-schedule-repair="dismiss"
          >
            Dismiss
          </button>
          <button
            className="btn btn-accent modalPreviewPrimaryAction primitiveSciFiModalAction primitiveSciFiModalPrimaryAction dashboardScheduleRepairPrimitiveAction dashboardScheduleRepairPrimitivePrimaryAction"
            type="button"
            data-schedule-repair="apply"
          >
            Accept
          </button>
          <button
            className="btn btn-warn primitiveSciFiModalAction dashboardScheduleRepairPrimitiveAction"
            type="button"
            data-schedule-repair="undo"
            hidden
          >
            Undo applied repair
          </button>
        </div>
      </div>
    </div>
  );
}

function isNativeOrFileRuntime() {
  try {
    return Capacitor.isNativePlatform() || window.location.protocol === "file:";
  } catch {
    return window.location.protocol === "file:";
  }
}

function ExecutiveTodayLocalTime() {
  const [currentLocalTime, setCurrentLocalTime] = useState("");

  useEffect(() => {
    const updateCurrentLocalTime = () => {
      setCurrentLocalTime(
        new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        }).format(new Date()),
      );
    };
    updateCurrentLocalTime();
    const timer = window.setInterval(updateCurrentLocalTime, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span
      className="executiveTodayLocalTime"
      id="executiveTodayLocalTime"
      aria-live="polite"
    >
      {currentLocalTime ? `Local time: ${currentLocalTime}` : "Local time"}
    </span>
  );
}

export default function ExecutivePageContent({ active }: Props) {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const frontRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLDivElement | null>(null);
  const hasMountedFlipRef = useRef(false);
  const [isBrainDumpOpen, setIsBrainDumpOpen] = useState(false);
  const [
    isExecutivePageRefreshRateLimited,
    setIsExecutivePageRefreshRateLimited,
  ] = useState(false);
  const [overlayPortalHost, setOverlayPortalHost] =
    useState<HTMLElement | null>(null);
  const [isExecutivePlanLocked, setIsExecutivePlanLocked] = useState(
    () => !hasTaskTimerEntitlement(readTaskTimerPlanFromStorage(), "executiveFunction"),
  );
  const nativePlusUpsell = useNativePlusUpsell({
    returnPath: "/executive",
    sourcePage: "executive",
  });

  useEffect(() => {
    setOverlayPortalHost(document.body);
  }, []);

  useEffect(() => {
    const syncPlanLock = () => {
      setIsExecutivePlanLocked(
        !hasTaskTimerEntitlement(
          readTaskTimerPlanFromStorage(),
          "executiveFunction",
        ),
      );
    };
    syncPlanLock();
    window.addEventListener(TASKTIMER_PLAN_CHANGED_EVENT, syncPlanLock);
    return () =>
      window.removeEventListener(TASKTIMER_PLAN_CHANGED_EVENT, syncPlanLock);
  }, []);

  useEffect(() => {
    let lastRefreshAtMs = 0;
    try {
      lastRefreshAtMs =
        Number(window.localStorage.getItem(EXECUTIVE_PAGE_REFRESH_AT_KEY)) || 0;
    } catch {
      // Treat unavailable local storage as a fresh page session.
    }
    const refreshRemainingMs = getExecutivePageRefreshRemainingMs(
      lastRefreshAtMs,
      Date.now(),
    );
    if (!refreshRemainingMs) return;
    const enableRateLimitTimer = window.setTimeout(
      () => setIsExecutivePageRefreshRateLimited(true),
      0,
    );
    const timer = window.setTimeout(
      () => setIsExecutivePageRefreshRateLimited(false),
      refreshRemainingMs,
    );
    return () => {
      window.clearTimeout(enableRateLimitTimer);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const syncBrainDumpFaceFromLocation = () => {
      setIsBrainDumpOpen(
        new URLSearchParams(window.location.search).get("view") ===
          "brain-dump",
      );
    };
    syncBrainDumpFaceFromLocation();
    window.addEventListener("popstate", syncBrainDumpFaceFromLocation);
    return () =>
      window.removeEventListener("popstate", syncBrainDumpFaceFromLocation);
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    const activeFace = isBrainDumpOpen ? backRef.current : frontRef.current;
    if (!scene || !activeFace) return;
    const syncHeight = () => {
      scene.style.height = `${activeFace.offsetHeight}px`;
    };
    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(activeFace);
    return () => observer.disconnect();
  }, [isBrainDumpOpen]);

  useEffect(() => {
    if (!hasMountedFlipRef.current) {
      hasMountedFlipRef.current = true;
      return;
    }
    const selector = isBrainDumpOpen
      ? "#brainDumpTitle"
      : "[data-executive-brain-dump-open]";
    const frame = window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(selector);
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isBrainDumpOpen]);

  useEffect(() => {
    if (!isBrainDumpOpen || !isNativeOrFileRuntime()) return;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo(0, 0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isBrainDumpOpen]);

  function openBrainDump(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (
      !hasTaskTimerEntitlement(
        readTaskTimerPlanFromStorage(),
        "executiveFunction",
      )
    ) {
      window.location.href = resolveTaskTimerRouteHref("/account");
      return;
    }
    playTaskFlipClickAudio();
    void trackEvent("brain_dump_entry_opened", { entry_point: "executive" });
    window.history.pushState(
      null,
      "",
      resolveTaskTimerRouteHref("/executive?view=brain-dump"),
    );
    setIsBrainDumpOpen(true);
  }

  function closeBrainDump() {
    playTaskFlipClickAudio();
    window.history.replaceState(
      null,
      "",
      resolveTaskTimerRouteHref("/executive"),
    );
    setIsBrainDumpOpen(false);
  }

  function refreshExecutivePage() {
    const nowMs = Date.now();
    let lastRefreshAtMs = 0;
    try {
      lastRefreshAtMs =
        Number(window.localStorage.getItem(EXECUTIVE_PAGE_REFRESH_AT_KEY)) || 0;
    } catch {
      // Continue with the in-memory cooldown when local storage is unavailable.
    }
    if (getExecutivePageRefreshRemainingMs(lastRefreshAtMs, nowMs) > 0) {
      setIsExecutivePageRefreshRateLimited(true);
      return;
    }
    try {
      window.localStorage.setItem(EXECUTIVE_PAGE_REFRESH_AT_KEY, String(nowMs));
    } catch {
      // The current session still refreshes when local storage is unavailable.
    }
    setIsExecutivePageRefreshRateLimited(true);
    window.location.reload();
  }

  return (
    <section
      className={`appPage${active ? " appPageOn" : ""}${isExecutivePlanLocked ? " isExecutivePlanLocked" : ""}`}
      id="appPageExecutive"
      aria-label="Executive page"
    >
      <div className="executiveUpgradePanel">
        <div
          className={`executiveFlipScene${isBrainDumpOpen ? " isFlipped" : ""}`}
          ref={sceneRef}
          aria-hidden={isExecutivePlanLocked}
          inert={isExecutivePlanLocked ? true : undefined}
        >
        <div
          className="executiveFlipFace executiveFlipFaceFront"
          ref={frontRef}
          aria-hidden={isBrainDumpOpen}
          inert={isBrainDumpOpen ? true : undefined}
        >
          <div className="executiveShell">
            <header className="executiveHeader">
              <div>
                <h1>Executive Function</h1>
                <p className="executiveHeaderSummary">
                  Today&apos;s decisions, next action, and plan health in one
                  place.
                </p>
              </div>
              <div className="executiveTodayMarker" aria-label="Today">
                <span>Today</span>
                <strong id="executiveTodayDate">Current plan</strong>
                <ExecutiveTodayLocalTime />
                <button
                  className="btn btn-ghost small executiveTodayRefreshButton"
                  id="executivePageRefreshBtn"
                  type="button"
                  onClick={refreshExecutivePage}
                  disabled={isExecutivePageRefreshRateLimited}
                  title={
                    isExecutivePageRefreshRateLimited
                      ? "Available one minute after the last refresh"
                      : "Refresh the entire Executive page"
                  }
                >
                  Refresh
                </button>
              </div>
            </header>

            <div
              className="executiveTodayHealth"
              aria-label="Today and plan health"
            >
              <div
                className="executiveMetricCard executiveMetricPlanHealth"
                data-executive-metric-helper-card="plan-health"
                role="button"
                tabIndex={0}
                aria-describedby="executiveMetricHelperPlanHealth"
                aria-expanded="false"
              >
                <span className="executiveMetricIcon">
                  <AppImg
                    src="/icons/icons_default/health.webp"
                    alt=""
                    aria-hidden="true"
                  />
                </span>
                <span className="executiveMetricCopy">
                  <span>Plan health</span>
                  <strong
                    id="executivePlanHealth"
                    data-executive-metric-loading="true"
                  >
                    Loading
                  </strong>
                </span>
                <span
                  className="executiveMetricHelper"
                  id="executiveMetricHelperPlanHealth"
                  role="tooltip"
                  aria-hidden="true"
                >
                  <strong>
                    Plan health compares your remaining estimated work with
                    today&apos;s capacity.
                  </strong>
                  <ul>
                    <li>
                      <b className="executivePlanHealthRealistic">Realistic:</b>{" "}
                      work is within capacity.
                    </li>
                    <li>
                      <b className="executivePlanHealthSlightlyOverloaded">
                        Slightly overloaded:
                      </b>{" "}
                      work exceeds capacity, up to 150% of its maximum.
                    </li>
                    <li>
                      <b className="executivePlanHealthSignificantlyOverloaded">
                        Significantly overloaded:
                      </b>{" "}
                      work is more than 150% of maximum capacity.
                    </li>
                    <li>
                      <b>Insufficient data:</b> there are no active tasks, or
                      every active task lacks an estimate.
                    </li>
                  </ul>
                </span>
              </div>
              <div
                className="executiveMetricCard"
                data-executive-metric-helper-card="remaining-capacity"
                role="button"
                tabIndex={0}
                aria-describedby="executiveMetricHelperRemainingCapacity"
                aria-expanded="false"
              >
                <span className="executiveMetricIcon">
                  <AppImg
                    src="/icons/icons_default/capacity_full.webp"
                    alt=""
                    aria-hidden="true"
                  />
                </span>
                <span className="executiveMetricCopy">
                  <span>Remaining capacity</span>
                  <strong
                    id="executiveCapacityRange"
                    data-executive-metric-loading="true"
                  >
                    Loading
                  </strong>
                </span>
                <span
                  className="executiveMetricHelper"
                  id="executiveMetricHelperRemainingCapacity"
                  role="tooltip"
                  aria-hidden="true"
                >
                  <strong>Your workable time left today.</strong>
                  <span>
                    TaskLaunch starts with your manual capacity setting or
                    recent focus history, preferring matching weekdays when
                    enough history exists. It caps that range to your available
                    focus window, then subtracts work completed today.
                  </span>
                </span>
              </div>
              <div
                className="executiveMetricCard"
                data-executive-metric-helper-card="work-remaining"
                role="button"
                tabIndex={0}
                aria-describedby="executiveMetricHelperWorkRemaining"
                aria-expanded="false"
              >
                <span className="executiveMetricIcon">
                  <AppImg
                    src="/icons/icons_default/work_remaining.webp"
                    alt=""
                    aria-hidden="true"
                  />
                </span>
                <span className="executiveMetricCopy">
                  <span>Work remaining</span>
                  <strong
                    id="executiveWorkRemaining"
                    data-executive-metric-loading="true"
                  >
                    Loading
                  </strong>
                </span>
                <span
                  className="executiveMetricHelper"
                  id="executiveMetricHelperWorkRemaining"
                  role="tooltip"
                  aria-hidden="true"
                >
                  The total scheduled task time still outstanding for today.
                </span>
              </div>
            </div>

            <div className="executiveDecisionFlow">
              <section
                className="executiveCard executiveNbaCard dashboardNextBestActionCard"
                id="dashboardNextBestActionCard"
                aria-label="Next best action"
                data-next-best-action-state="loading"
              >
                <div className="executiveSectionHeading">
                  <div>
                    <p className="executiveEyebrow">Next best action</p>
                    <div
                      className="dashboardNextBestActionTimeLabel"
                      id="dashboardNextBestActionTimeLabel"
                    >
                      Available time
                    </div>
                    <select
                      id="dashboardNextBestActionTimeSelect"
                      defaultValue="any"
                      aria-label="Available time for next best action"
                      hidden
                    >
                      <option value="10">10m</option>
                      <option value="20">20m</option>
                      <option value="30">30m</option>
                      <option value="60">60m</option>
                      <option value="any">Any</option>
                    </select>
                    <div
                      className="dashboardNextBestActionTimePills"
                      role="group"
                      aria-labelledby="dashboardNextBestActionTimeLabel"
                    >
                      <button
                        className="dashboardNextBestActionTimePill"
                        type="button"
                        data-next-best-action-time="10"
                        aria-pressed="false"
                      >
                        10m
                      </button>
                      <button
                        className="dashboardNextBestActionTimePill"
                        type="button"
                        data-next-best-action-time="20"
                        aria-pressed="false"
                      >
                        20m
                      </button>
                      <button
                        className="dashboardNextBestActionTimePill"
                        type="button"
                        data-next-best-action-time="30"
                        aria-pressed="false"
                      >
                        30m
                      </button>
                      <button
                        className="dashboardNextBestActionTimePill"
                        type="button"
                        data-next-best-action-time="60"
                        aria-pressed="false"
                      >
                        60m
                      </button>
                      <button
                        className="dashboardNextBestActionTimePill"
                        type="button"
                        data-next-best-action-time="any"
                        aria-pressed="true"
                      >
                        Any
                      </button>
                    </div>
                  </div>
                </div>
                <div
                  className="dashboardNextBestActionStatus executiveStatus"
                  id="dashboardNextBestActionStatus"
                  role="status"
                  aria-live="polite"
                >
                  Loading your next best action...
                </div>
                <div
                  className="dashboardNextBestActionContent executiveNbaContent"
                  id="dashboardNextBestActionContent"
                  hidden
                  aria-hidden="true"
                >
                  <h3
                    className="dashboardNextBestActionTitle"
                    id="dashboardNextBestActionTitle"
                  />
                  <div className="dashboardNextBestActionPills">
                    <span
                      className="dashboardNextBestActionTimeGoal"
                      id="dashboardNextBestActionTimeGoal"
                      hidden
                      aria-hidden="true"
                    />
                    <span
                      className="dashboardNextBestActionTimeGoal"
                      id="dashboardNextBestActionDailyProgress"
                      hidden
                      aria-hidden="true"
                    />
                  </div>
                  <p
                    className="dashboardNextBestActionFirstAction"
                    id="dashboardNextBestActionFirstAction"
                  />
                  <div
                    className="dashboardNextBestActionExplanation"
                    id="dashboardNextBestActionExplanation"
                  >
                    <p className="dashboardNextBestActionExplanationSummary">
                      <strong>Why this?</strong>{" "}
                      <span>This recommendation will summarize why it fits now.</span>
                    </p>
                    <ul className="dashboardNextBestActionExplanationList">
                      <li>
                        <span className="dashboardNextBestActionExplanationLabel">Estimated effort based on historical duration</span>
                        <span className="dashboardNextBestActionExplanationValue">Loading</span>
                      </li>
                      <li>
                        <span className="dashboardNextBestActionExplanationLabel">Last history entry</span>
                        <span className="dashboardNextBestActionExplanationValue">Loading</span>
                      </li>
                      <li>
                        <span className="dashboardNextBestActionExplanationLabel">Confidence</span>
                        <span className="dashboardNextBestActionExplanationValue">Loading</span>
                      </li>
                    </ul>
                  </div>
                  <div
                    className="dashboardNextBestActionActions"
                    aria-label="Next Best Action actions"
                  >
                    <button
                      className="btn btn-accent dashboardStartNowButton"
                      type="button"
                      data-next-best-action="start"
                      data-next-best-action-action="start"
                      disabled
                    >
                      <AppImg
                        className="dashboardStartNowButtonIcon"
                        src="/icons/icons_default/launch_black.webp"
                        alt=""
                        aria-hidden="true"
                      />
                      <span className="dashboardStartNowButtonLabel">
                        LAUNCH
                      </span>
                    </button>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      data-next-best-action="alternative"
                      data-next-best-action-action="alternative"
                      disabled
                    >
                      Alternative
                    </button>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      data-next-best-action="dismiss"
                      data-next-best-action-action="dismiss"
                      disabled
                    >
                      Not now
                    </button>
                  </div>
                </div>
                <div
                  className="dashboardNextBestActionEmpty"
                  id="dashboardNextBestActionEmpty"
                  hidden
                  aria-hidden="true"
                >
                  No eligible task is ready right now.
                </div>
                <div
                  className="dashboardNextBestActionError"
                  id="dashboardNextBestActionError"
                  hidden
                  aria-hidden="true"
                >
                  This recommendation is unavailable right now.
                </div>
                <button
                  className="btn btn-ghost dashboardNextBestActionRetry"
                  id="dashboardNextBestActionRetry"
                  type="button"
                  hidden
                >
                  Retry
                </button>
              </section>

              <section className="executiveTools" aria-label="Executive tools">
                <p className="executiveEyebrow executiveToolsLabel">
                  Executive Tools
                </p>
                <div className="executiveToolLinks">
                  <button
                    className="btn btn-ghost"
                    type="button"
                    data-schedule-repair="review"
                  >
                    <AppImg
                      className="executiveToolIcon executiveToolRepairIcon"
                      src="/icons/icons_default/repair.webp"
                      alt=""
                      aria-hidden="true"
                    />
                    <span className="executiveToolCopy">
                      <span className="executiveToolLabel">
                        Repair today&apos;s plan
                      </span>
                      <small>
                        <span id="dashboardScheduleRepairToolStatus">
                        Review today&apos;s workload, suggested changes, and
                        rebalance tasks.
                        </span>
                      </small>
                    </span>
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    data-recovery="open"
                  >
                    <AppImg
                      className="executiveToolIcon"
                      src="/icons/icons_default/reset.webp"
                      alt=""
                      aria-hidden="true"
                    />
                    <span className="executiveToolCopy">
                      <span className="executiveToolLabel">Recovery Mode</span>
                      <small>
                        Reset priorities, defer flexible work, and rebuild a
                        manageable plan when today is no longer working.
                      </small>
                    </span>
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    data-daily-capacity="adjust"
                  >
                    <AppImg
                      className="executiveToolIcon"
                      src="/icons/icons_default/preferences.webp"
                      alt=""
                      aria-hidden="true"
                    />
                    <span className="executiveToolCopy">
                      <span className="executiveToolLabel">
                        Adjust capacity
                      </span>
                      <small>
                        Set how much focused work you can realistically handle
                        today without changing your task history.
                      </small>
                    </span>
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    data-executive-brain-dump-open
                    data-brain-dump-entry="executive"
                    onClick={openBrainDump}
                  >
                    <AppImg
                      className="executiveToolIcon"
                      src="/icons/icons_default/executive.webp"
                      alt=""
                      aria-hidden="true"
                    />
                    <span className="executiveToolCopy">
                      <span className="executiveToolLabel">Brain Dump</span>
                      <small>
                        Capture unstructured thoughts, extract potential tasks,
                        and review them before anything is created.
                      </small>
                    </span>
                  </button>
                </div>
              </section>
            </div>

            <div
              className="dashboardDailyCapacityCard executiveCapacityServiceHost"
              id="dashboardDailyCapacityCard"
              data-daily-capacity-state="loading"
              hidden
              aria-hidden="true"
            >
              <div
                className="dashboardDailyCapacityStatus"
                id="dashboardDailyCapacityStatus"
                role="status"
                aria-live="polite"
              >
                Loading today&apos;s capacity...
              </div>
              <div
                className="dashboardDailyCapacityContent"
                id="dashboardDailyCapacityContent"
              >
                <strong
                  className="dashboardDailyCapacityRange"
                  id="dashboardDailyCapacityRange"
                >
                  Loading
                </strong>
                <span
                  className="dashboardDailyCapacityState"
                  id="dashboardDailyCapacityState"
                >
                  Loading
                </span>
                <span
                  className="dashboardDailyCapacityConfidence"
                  id="dashboardDailyCapacityConfidence"
                >
                  Confidence: low
                </span>
                <p
                  className="dashboardDailyCapacityExplanation"
                  id="dashboardDailyCapacityExplanation"
                >
                  TaskLaunch will personalise this estimate as more session
                  history becomes available.
                </p>
              </div>
              <button
                className="btn btn-ghost dashboardDailyCapacityRetry"
                id="dashboardDailyCapacityRetry"
                type="button"
                data-daily-capacity="refresh"
                hidden
              >
                Try again
              </button>
            </div>

            {overlayPortalHost &&
              createPortal(
                <div
                  className="overlay primitiveSciFiModalOverlay dashboardRecoveryPrimitiveOverlay"
              id="dashboardRecoveryOverlay"
              style={{ display: "none" }}
              aria-hidden="true"
            >
              <div
                className="modal dashboardRecoveryModal dashboardRecoveryPrimitiveModal"
                role="dialog"
                aria-modal="true"
                aria-label="Recovery Mode"
                aria-describedby="dashboardRecoveryDescription"
              >
                <header className="dashboardRecoveryPrimitiveHeader">
                  <h2 className="modalTitle">Let&apos;s reset the plan</h2>
                </header>
                <div className="dashboardRecoveryPrimitiveBody">
                  <p className="modalSubtext" id="dashboardRecoveryDescription">
                    Start from where you are. Nothing changes until you explicitly
                    confirm it.
                  </p>
                  <div
                    className="dashboardRecoveryStages"
                    aria-label="Recovery stages"
                  >
                    <span className="dashboardRecoveryStage is-active">
                      1. What matters now
                    </span>
                    <span className="dashboardRecoveryStage">
                      2. What can wait
                    </span>
                    <span className="dashboardRecoveryStage">3. Restart</span>
                  </div>
                  <div
                    className="dashboardRecoveryModalStatus"
                    id="dashboardRecoveryModalStatus"
                    role="status"
                    aria-live="polite"
                  />
                  <section
                    className="dashboardRecoverySection"
                    aria-labelledby="dashboardRecoveryRestartHeading"
                  >
                    <h3 id="dashboardRecoveryRestartHeading">Start here</h3>
                    <div
                      className="dashboardRecoveryRestart"
                      id="dashboardRecoveryRestart"
                    />
                  </section>
                  <section
                    className="dashboardRecoverySection"
                    aria-labelledby="dashboardRecoveryAttentionHeading"
                  >
                    <h3 id="dashboardRecoveryAttentionHeading">
                      Needs attention
                    </h3>
                    <div
                      className="dashboardRecoveryActionList"
                      id="dashboardRecoveryAttentionList"
                    />
                  </section>
                  <section
                    className="dashboardRecoverySection"
                    aria-labelledby="dashboardRecoveryFlexibleHeading"
                  >
                    <h3 id="dashboardRecoveryFlexibleHeading">Can wait</h3>
                    <div
                      className="dashboardRecoveryActionList"
                      id="dashboardRecoveryFlexibleList"
                    />
                  </section>
                </div>
                <footer className="confirmBtns dashboardRecoveryPrimitiveFooter">
                  <button
                    className="btn btn-ghost primitiveSciFiModalAction primitiveSciFiModalSecondaryAction dashboardRecoveryPrimitiveAction dashboardRecoveryPrimitiveSecondaryAction modalPreviewSecondaryAction"
                    type="button"
                    data-recovery="dismiss"
                  >
                    Dismiss
                  </button>
                  <button
                    className="btn btn-accent primitiveSciFiModalAction primitiveSciFiModalPrimaryAction dashboardRecoveryPrimitiveAction dashboardRecoveryPrimitivePrimaryAction modalPreviewPrimaryAction"
                    type="button"
                    data-recovery="apply"
                  >
                    Apply selected changes
                  </button>
                </footer>
                </div>
                </div>,
                overlayPortalHost,
              )}
          </div>
        </div>
        <div
          className="executiveFlipFace executiveFlipFaceBack"
          ref={backRef}
          aria-hidden={!isBrainDumpOpen}
          inert={isBrainDumpOpen ? undefined : true}
        >
          <BrainDumpClient embedded onBack={closeBrainDump} />
        </div>
        </div>
        {isExecutivePlanLocked ? (
          <div className="executiveUpgradeGate">
            <button
              className="btn btn-accent executiveUpgradeGateButton"
              type="button"
              onClick={nativePlusUpsell.show}
            >
              Upgrade to PLUS
            </button>
          </div>
        ) : null}
      </div>
      <NativePlusUpsellModal
        open={nativePlusUpsell.open}
        busy={nativePlusUpsell.busy}
        error={nativePlusUpsell.error}
        selectedOffer={nativePlusUpsell.selectedOffer}
        onClose={nativePlusUpsell.close}
        onSelectOffer={nativePlusUpsell.setSelectedOffer}
        onConfirm={nativePlusUpsell.startCheckout}
      />
      {overlayPortalHost ? (
        <>
          {createPortal(<DailyCapacityAdjustOverlay />, overlayPortalHost)}
          {createPortal(<ScheduleRepairOverlay />, overlayPortalHost)}
        </>
      ) : (
        <>
          <DailyCapacityAdjustOverlay />
          <ScheduleRepairOverlay />
        </>
      )}
    </section>
  );
}
