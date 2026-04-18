import { sessionColorForTaskMs } from "../lib/colors";
import {
  dashboardAvgRangeLabel,
  formatDashboardDurationShort,
  formatDashboardDurationWithMinutes,
  getDashboardWeekdayLabels,
  getDashboardAvgRangeWindow,
  startOfCurrentWeekMs,
} from "../lib/historyChart";
import { localDayKey } from "../lib/history";
import { computeMomentumSnapshot, getMomentumBandLabel, type MomentumSnapshot } from "../lib/momentum";
import { formatTime, formatTwo, nowMs } from "../lib/time";
import type { TaskTimerDashboardRenderContext } from "./context";
import type { DashboardAvgRange, DashboardMomentumDriverKey, DashboardTimelineDensity, MainMode } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function createTaskTimerDashboardRender(ctx: TaskTimerDashboardRenderContext) {
  const { els } = ctx;
  let dashboardHeatSelectedDayKey = "";
  let selectedTimelineSuggestionKey: string | null = null;
  let lastMomentumRenderSignature = "";
  let lastMomentumAnimatedTargetScore: number | null = null;
  let lastMomentumAnimatedTargetBand: string | null = null;
  let momentumAnimationFrameId: number | null = null;
  let momentumAnimationStartTimerId: number | null = null;
  let selectedMomentumDriverKey: DashboardMomentumDriverKey | null = null;
  let selectedMomentumDriverResetTimerId: number | null = null;
  const MOMENTUM_GAUGE_START_DEG = -180;
  const MOMENTUM_GAUGE_END_DEG = 0;
  const MOMENTUM_ANIMATION_DURATION_MS = 1050;
  const MOMENTUM_MEANINGFUL_DELTA = 3;
  const MOMENTUM_DRIVER_DEFS = [
    { key: "recentActivity", label: "Recent activity", max: 25 },
    { key: "consistency", label: "Consistency", max: 45 },
    { key: "weeklyProgress", label: "Weekly Progress", max: 20 },
    { key: "liveBonus", label: "Live Bonus", max: 10 },
  ] as const;
  const MOMENTUM_DRIVER_AUTO_RESET_MS = 10000;

  function setDashboardPlanLockedState(cardEl: HTMLElement | null, isLocked: boolean) {
    if (!cardEl) return;
    const shouldShowCenteredLock = isLocked && ctx.getCurrentPlan() === "free";
    let lockEl = cardEl.querySelector(":scope > .dashboardPlanLockIcon") as HTMLElement | null;
    if (!lockEl) {
      lockEl = document.createElement("span");
      lockEl.className = "dashboardPlanLockIcon";
      lockEl.setAttribute("aria-hidden", "true");
      lockEl.textContent = "Lock";
      cardEl.appendChild(lockEl);
    }
    cardEl.classList.toggle("isPlanLocked", isLocked);
    cardEl.classList.toggle("hasCenteredPlanLock", shouldShowCenteredLock);
    lockEl.hidden = !shouldShowCenteredLock;
    if (isLocked) cardEl.setAttribute("aria-disabled", "true");
    else cardEl.removeAttribute("aria-disabled");
  }

  function hasAdvancedInsights() {
    return ctx.hasEntitlement("advancedInsights");
  }

  function sanitizeDashboardAvgRange(value: unknown): DashboardAvgRange {
    const raw = String(value || "").trim();
    if (raw === "past30" || raw === "currentMonth") return "past30";
    if (raw === "currentWeek") return "past7";
    return "past7";
  }

  function sanitizeDashboardTimelineDensity(value: unknown): DashboardTimelineDensity {
    const raw = String(value || "").trim();
    if (raw === "low" || raw === "high") return raw;
    return "medium";
  }

  function dashboardTimelineDensityLabel(value: DashboardTimelineDensity) {
    if (value === "low") return "Low";
    if (value === "high") return "High";
    return "Medium";
  }

  function applyDashboardTrendIndicator(indicatorEl: HTMLElement | null, currentMs: number, previousMs: number) {
    if (!indicatorEl) return null;
    indicatorEl.classList.remove("positive", "negative", "neutral");
    if (!(previousMs > 0)) {
      indicatorEl.textContent = "--";
      return null;
    }
    const deltaPct = Math.round(((currentMs - previousMs) / previousMs) * 100);
    indicatorEl.textContent = deltaPct > 0 ? `↑${deltaPct}%` : deltaPct < 0 ? `↓${Math.abs(deltaPct)}%` : "0%";
    if (deltaPct > 0) indicatorEl.classList.add("positive");
    else if (deltaPct < 0) indicatorEl.classList.add("negative");
    else indicatorEl.classList.add("neutral");
    return deltaPct;
  }

  function getDashboardTimelineDensityTarget(value: DashboardTimelineDensity) {
    if (value === "low") return 3;
    if (value === "high") return 7;
    return 5;
  }

  function shouldHoldDashboardWidget<K extends keyof ReturnType<TaskTimerDashboardRenderContext["getDashboardWidgetHasRenderedData"]>>(
    widget: K,
    hasData: boolean
  ) {
    const renderedData = ctx.getDashboardWidgetHasRenderedData();
    if (hasData) {
      renderedData[widget] = true;
      return false;
    }
    return (ctx.getDashboardRefreshHoldActive() || !!ctx.getCloudRefreshInFlight()) && renderedData[widget];
  }

  function getDashboardIncludedTaskIds() {
    const taskIds = new Set<string>();
    (ctx.getTasks() || []).forEach((task) => {
      if (!task) return;
      const taskId = String(task.id || "").trim();
      if (taskId) taskIds.add(taskId);
    });
    return taskIds;
  }

  function isDashboardTaskIncluded(taskId: string, includedTaskIds?: Set<string>) {
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) return false;
    const source = includedTaskIds || getDashboardIncludedTaskIds();
    return source.has(normalizedTaskId);
  }

  function getDashboardFilteredTasks() {
    return (ctx.getTasks() || []).filter((task) => !!task);
  }

  function renderLockedTimelineMock(
    cardEl: HTMLElement | null,
    listEl: HTMLElement | null,
    noteEl: HTMLElement | null,
    summaryEl: HTMLElement | null
  ) {
    const mockItems = [
      { taskName: "Deep Work", label: "08:30 - 10:00", duration: "1h 30m", leftPct: 13, widthPct: 19, colorIndex: 0 },
      { taskName: "Admin", label: "10:30 - 11:15", duration: "45m", leftPct: 29, widthPct: 10, colorIndex: 2 },
      { taskName: "Study", label: "14:00 - 15:30", duration: "1h 30m", leftPct: 58, widthPct: 18, colorIndex: 1 },
    ];
    if (noteEl) noteEl.textContent = "Example Pro timeline preview";
    if (listEl) {
      listEl.innerHTML = mockItems
        .map(
          (item) => `
            <div class="dashboardTimelineLane" role="listitem">
              <div class="dashboardTimelineLaneInfo">
                <p class="dashboardTimelineLabel">${ctx.escapeHtmlUI(item.taskName)}</p>
                <span class="dashboardTimelineDuration">${ctx.escapeHtmlUI(item.duration)}</span>
              </div>
              <div class="dashboardTimelineLaneTrack">
                <span class="dashboardTimelineSegment dashboardTimelineSegmentColor-${item.colorIndex}" style="left:${item.leftPct}%; width:${item.widthPct}%;"></span>
                <span class="dashboardTimelineMarkerBtn" aria-hidden="true" style="left:${item.leftPct + item.widthPct / 2}%;">
                  <span class="dashboardTimelineMarker"></span>
                </span>
              </div>
            </div>
          `
        )
        .join("");
    }
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="dashboardTimelineSummaryCard">
          <p class="dashboardTimelineSummaryTitle">Pro unlocks personalized timeline suggestions</p>
          <div class="dashboardTimelineSummaryMeta">
            <span>Adaptive time blocks</span>
            <span>History-based timing</span>
            <span>Density controls</span>
          </div>
        </div>
      `;
    }
    if (cardEl) {
      cardEl.setAttribute("aria-description", "Example Pro timeline preview. Upgrade to view your personalized routine suggestions.");
    }
  }

  function renderLockedHeatmapMock(
    monthLabelEl: HTMLElement | null,
    weekdaysEl: HTMLElement | null,
    gridEl: HTMLElement | null
  ) {
    if (monthLabelEl) monthLabelEl.textContent = "Past 4 Weeks";
    if (weekdaysEl) {
      weekdaysEl.innerHTML = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        .map((label) => `<span>${ctx.escapeHtmlUI(label)}</span>`)
        .join("");
    }
    if (!gridEl) return;
    const levels = [
      "low", "none", "medium", "none", "high", "medium", "none",
      "medium", "low", "high", "medium", "none", "low", "none",
      "none", "medium", "high", "medium", "low", "none", "low",
      "medium", "none", "high", "medium", "low", "none", "medium",
    ];
    gridEl.innerHTML = levels
      .map((level, idx) => {
        const day = idx + 1;
        const activeClass = level === "none" ? "" : " isActive";
        const styleAttr =
          level === "high"
            ? ' style="--heat-color:hsl(18 90% 54%)"'
            : level === "medium"
              ? ' style="--heat-color:hsl(42 92% 58%)"'
              : level === "low"
                ? ' style="--heat-color:hsl(122 54% 48%)"'
                : "";
        return `<span class="dashboardHeatDayCell${activeClass}" data-activity-level="${level}" role="gridcell" aria-hidden="true"${styleAttr}><span class="dashboardHeatDayNum">${day}</span></span>`;
      })
      .join("");
  }

  function renderLockedAvgSessionMock(
    canvas: HTMLCanvasElement | null,
    wrap: HTMLElement | null,
    emptyEl: HTMLElement | null
  ) {
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(220, Math.floor(rect.width || wrap.clientWidth || 320));
    const height = Math.max(180, Math.floor(rect.height || wrap.clientHeight || 220));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = "100%";
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const labels = ["Writing", "Study", "Planning", "Review"];
    const values = [82, 64, 48, 36];
    const chartLeft = 58;
    const chartRight = width - 22;
    const chartTop = 16;
    const chartBottom = height - 42;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;
    const maxValue = Math.max(...values, 1);
    const stepX = chartWidth / labels.length;

    context.strokeStyle = "rgba(180, 220, 240, 0.12)";
    context.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = chartTop + (chartHeight / 4) * i;
      context.beginPath();
      context.moveTo(chartLeft, y);
      context.lineTo(chartRight, y);
      context.stroke();
    }

    context.font = "10px var(--font-readable), system-ui";
    context.fillStyle = "rgba(182, 210, 224, 0.72)";
    context.textAlign = "right";
    context.textBaseline = "middle";
    [90, 60, 30, 0].forEach((value, idx) => {
      const y = chartTop + (chartHeight / 3) * idx;
      context.fillText(`${value}m`, chartLeft - 10, y);
    });

    labels.forEach((label, idx) => {
      const value = values[idx] || 0;
      const barWidth = Math.min(42, stepX * 0.56);
      const x = chartLeft + stepX * idx + (stepX - barWidth) / 2;
      const barHeight = Math.round((value / maxValue) * (chartHeight - 6));
      const y = chartBottom - barHeight;
      const gradient = context.createLinearGradient(x, y, x + barWidth, chartBottom);
      gradient.addColorStop(0, "rgba(53,232,255,0.92)");
      gradient.addColorStop(1, "rgba(0,207,200,0.7)");
      context.fillStyle = gradient;
      context.fillRect(x, y, barWidth, barHeight);
      context.fillStyle = "rgba(226, 242, 250, 0.82)";
      context.textAlign = "center";
      context.textBaseline = "top";
      context.fillText(label, x + barWidth / 2, chartBottom + 10);
    });

    if (emptyEl) emptyEl.style.display = "none";
  }

  function cancelMomentumAnimation() {
    if (momentumAnimationStartTimerId != null) {
      window.clearTimeout(momentumAnimationStartTimerId);
      momentumAnimationStartTimerId = null;
    }
    if (momentumAnimationFrameId == null) return;
    window.cancelAnimationFrame(momentumAnimationFrameId);
    momentumAnimationFrameId = null;
  }

  function clearSelectedMomentumDriverResetTimer() {
    if (selectedMomentumDriverResetTimerId == null) return;
    window.clearTimeout(selectedMomentumDriverResetTimerId);
    selectedMomentumDriverResetTimerId = null;
  }

  function clearDashboardMomentumDriverSelection() {
    if (!selectedMomentumDriverKey && selectedMomentumDriverResetTimerId == null) return;
    clearSelectedMomentumDriverResetTimer();
    if (!selectedMomentumDriverKey) return;
    selectedMomentumDriverKey = null;
    renderDashboardMomentumCard();
  }

  function hasSelectedDashboardMomentumDriver() {
    return !!selectedMomentumDriverKey;
  }

  function sanitizeMomentumDriverKey(value: unknown): DashboardMomentumDriverKey | null {
    const raw = String(value || "").trim();
    return MOMENTUM_DRIVER_DEFS.some((driver) => driver.key === raw) ? (raw as DashboardMomentumDriverKey) : null;
  }

  function getMomentumNeedleDeg(score: number) {
    const boundedScore = Math.max(0, Math.min(100, Number(score) || 0));
    return MOMENTUM_GAUGE_START_DEG + (boundedScore / 100) * (MOMENTUM_GAUGE_END_DEG - MOMENTUM_GAUGE_START_DEG);
  }

  function buildMomentumDriverRows(scores: number[]) {
    return MOMENTUM_DRIVER_DEFS.map((driver, index) => {
      const rawScore = Math.max(0, Math.min(driver.max, Number(scores[index] || 0)));
      const roundedScore = Math.round(rawScore);
      const contributionPct = driver.max > 0 ? roundedScore / driver.max : 0;
      const contributionBand =
        contributionPct >= 0.75 ? "high" : contributionPct >= 0.5 ? "upper-mid" : contributionPct >= 0.25 ? "lower-mid" : "low";
      return {
        key: driver.key,
        label: driver.label,
        roundedScore,
        max: driver.max,
        contributionBand,
      };
    });
  }

  function renderMomentumDriverRows(
    driverTextsEl: HTMLElement,
    scores: number[],
    opts?: { interactive?: boolean; selectedKey?: DashboardMomentumDriverKey | null; messages?: Partial<Record<DashboardMomentumDriverKey, string>> }
  ) {
    const rows = buildMomentumDriverRows(scores);
    driverTextsEl.classList.toggle("hasSelectedDriver", !!opts?.selectedKey);
    driverTextsEl.innerHTML = rows
      .map(
        (row) => `<li class="dashboardMomentumDriver${row.key === opts?.selectedKey ? " isSelected" : ""}" data-dashboard-momentum-band="${ctx.escapeHtmlUI(row.contributionBand)}"${
          opts?.interactive
            ? ` data-dashboard-momentum-driver="${ctx.escapeHtmlUI(row.key)}"`
            : ""
        }>
          ${
            opts?.interactive
              ? `<button
                  class="dashboardMomentumDriverButton"
                  type="button"
                  data-dashboard-momentum-driver="${ctx.escapeHtmlUI(row.key)}"
                  aria-pressed="${row.key === opts?.selectedKey ? "true" : "false"}"
                >
                  <span class="dashboardMomentumDriverText">${ctx.escapeHtmlUI(`${row.label}: ${row.roundedScore}/${row.max}`)}</span>
                </button>`
              : `<span class="dashboardMomentumDriverText">${ctx.escapeHtmlUI(`${row.label}: ${row.roundedScore}/${row.max}`)}</span>`
          }
        </li>`
      )
      .join("");
  }

  function buildMomentumDriverMessages(momentum: MomentumSnapshot) {
    const recentLabels = ["today", "yesterday", "two days ago"];
    const recentText = momentum.recentDaysMs
      .map((ms, index) => `${formatDashboardDurationShort(ms)} ${recentLabels[index]}`)
      .join(", ");
    const weeklyPct = momentum.currentWeekGoalMs > 0 ? Math.round((momentum.currentWeekLoggedMs / momentum.currentWeekGoalMs) * 100) : null;
    return {
      recentActivity: `Recent Activity contributed ${Math.round(momentum.recentActivityScore)} of 25 momentum points from ${recentText}.`,
      consistency: `Consistency contributed ${Math.round(momentum.consistencyScore)} of 45 momentum points from ${momentum.activeDayCount} active day${momentum.activeDayCount === 1 ? "" : "s"} this week and a ${momentum.trailingStreak}-day trailing streak.`,
      weeklyProgress:
        weeklyPct == null
          ? `Weekly Progress contributed ${Math.round(momentum.weeklyProgressScore)} of 20 momentum points. Add weekly or daily time goals to give this driver more signal.`
          : `Weekly Progress contributed ${Math.round(momentum.weeklyProgressScore)} of 20 momentum points from ${formatDashboardDurationShort(momentum.currentWeekLoggedMs)} logged against ${formatDashboardDurationShort(momentum.currentWeekGoalMs)} of weekly goal time, about ${weeklyPct}%.`,
      liveBonus:
        momentum.runningTaskCount > 0
          ? `Live Bonus contributed ${Math.round(momentum.activeSessionBonus)} of 10 momentum points because ${momentum.runningTaskCount} task${momentum.runningTaskCount === 1 ? " is" : "s are"} currently running.`
          : "Live Bonus contributed 0 of 10 momentum points because no task is currently running.",
    } satisfies Record<DashboardMomentumDriverKey, string>;
  }

  function buildMomentumSummaryMessage(momentum: MomentumSnapshot) {
    const roundedScore = Math.round(momentum.score);
    const bandLabel = getMomentumBandLabel(roundedScore);
    const activityDays = momentum.activeDayCount;
    const loggedThisWeek = formatDashboardDurationShort(momentum.currentWeekLoggedMs);
    return `Momentum is ${bandLabel.toLowerCase()} at ${roundedScore}/100, driven by ${activityDays} active day${activityDays === 1 ? "" : "s"} this week and ${loggedThisWeek} logged so far.`;
  }

  function renderMomentumFooterMessage(targetEl: HTMLElement | null, message: string) {
    if (!targetEl) return;
    targetEl.textContent = String(message || "").trim();
  }

  function getCurrentMomentumDisplayedScore(dialEl: HTMLElement, arcActiveEl: SVGPathElement) {
    const cssScore = Number.parseFloat(String(dialEl.style.getPropertyValue("--momentum-score") || ""));
    if (Number.isFinite(cssScore)) return Math.max(0, Math.min(100, cssScore));
    const dashScore = Number.parseFloat(String(arcActiveEl.getAttribute("stroke-dasharray") || "").split(/\s+/)[0] || "");
    if (Number.isFinite(dashScore)) return Math.max(0, Math.min(100, dashScore));
    return 0;
  }

  const MOMENTUM_GAUGE_COLOR_STOPS = [
    { offset: 0, rgb: [143, 22, 35] as const },
    { offset: 12, rgb: [228, 66, 31] as const },
    { offset: 26, rgb: [255, 122, 28] as const },
    { offset: 42, rgb: [247, 166, 37] as const },
    { offset: 58, rgb: [255, 213, 74] as const },
    { offset: 78, rgb: [207, 224, 111] as const },
    { offset: 100, rgb: [169, 214, 95] as const },
  ] as const;

  function getMomentumGaugeTextColor(score: number) {
    const boundedScore = Math.max(0, Math.min(100, Number(score) || 0));
    let leftStop = MOMENTUM_GAUGE_COLOR_STOPS[0];
    let rightStop = MOMENTUM_GAUGE_COLOR_STOPS[MOMENTUM_GAUGE_COLOR_STOPS.length - 1];
    for (let i = 1; i < MOMENTUM_GAUGE_COLOR_STOPS.length; i += 1) {
      const stop = MOMENTUM_GAUGE_COLOR_STOPS[i];
      if (boundedScore <= stop.offset) {
        leftStop = MOMENTUM_GAUGE_COLOR_STOPS[i - 1];
        rightStop = stop;
        break;
      }
    }
    const span = Math.max(1, rightStop.offset - leftStop.offset);
    const progress = Math.max(0, Math.min(1, (boundedScore - leftStop.offset) / span));
    const rgb = leftStop.rgb.map((value, index) => Math.round(value + (rightStop.rgb[index] - value) * progress)) as [number, number, number];
    return {
      color: `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`,
      textShadow: `0 0 8px rgba(${rgb[0]},${rgb[1]},${rgb[2]},.2)`,
    };
  }

  function applyMomentumMultiplierIllumination(dialEl: HTMLElement, score: number) {
    const boundedScore = Math.max(0, Math.min(100, Number(score) || 0));
    const multiplierLabels = Array.from(
      dialEl.querySelectorAll("[data-momentum-multiplier-threshold]")
    ) as SVGTextElement[];
    multiplierLabels.forEach((labelEl) => {
      const threshold = Number(labelEl.getAttribute("data-momentum-multiplier-threshold") || 0);
      const isLit = Number.isFinite(threshold) && boundedScore >= threshold;
      labelEl.style.fill = isLit ? "rgba(255, 255, 255, 0.98)" : "rgba(241, 247, 255, 0.38)";
      labelEl.style.opacity = isLit ? "1" : "0.62";
      labelEl.style.filter = isLit ? "drop-shadow(0 0 6px rgba(255,255,255,.42))" : "none";
    });
  }

  function applyMomentumVisualState(opts: {
    dialEl: HTMLElement;
    arcActiveEl: SVGPathElement;
    needleEl: HTMLElement;
    scoreValueEl: HTMLElement;
    scoreStatusEl: HTMLElement;
    score: number;
    ariaBandLabel?: string;
    statusLabel?: string;
  }) {
    const boundedScore = Math.max(0, Math.min(100, Number(opts.score) || 0));
    const roundedScore = Math.round(boundedScore);
    const displayedBandLabel = getMomentumBandLabel(roundedScore);
    const ariaBandLabel = String(opts.ariaBandLabel || displayedBandLabel).trim() || displayedBandLabel;
    const displayedBandKey =
      roundedScore < 25 ? "low" : roundedScore < 50 ? "lower-mid" : roundedScore < 75 ? "upper-mid" : "high";
    const gaugeTextColor = getMomentumGaugeTextColor(boundedScore);
    opts.dialEl.style.setProperty("--momentum-score", String(boundedScore));
    opts.dialEl.setAttribute("aria-label", `Momentum score ${roundedScore} out of 100, ${ariaBandLabel}`);
    opts.dialEl.setAttribute("data-dashboard-momentum-band", displayedBandKey);
    opts.scoreValueEl.textContent = String(roundedScore);
    opts.scoreValueEl.setAttribute("data-dashboard-momentum-band", displayedBandKey);
    opts.scoreValueEl.style.color = gaugeTextColor.color;
    opts.scoreValueEl.style.textShadow = gaugeTextColor.textShadow;
    opts.scoreStatusEl.textContent = opts.statusLabel || displayedBandLabel;
    opts.scoreStatusEl.setAttribute("data-dashboard-momentum-band", displayedBandKey);
    opts.scoreStatusEl.style.color = gaugeTextColor.color;
    opts.scoreStatusEl.style.textShadow = gaugeTextColor.textShadow;
    opts.arcActiveEl.setAttribute("stroke-dasharray", `${boundedScore} 100`);
    opts.needleEl.style.setProperty("--momentum-needle-deg", `${getMomentumNeedleDeg(boundedScore)}deg`);
    applyMomentumMultiplierIllumination(opts.dialEl, boundedScore);
  }

  function animateMomentumToScore(opts: {
    dialEl: HTMLElement;
    arcActiveEl: SVGPathElement;
    needleEl: HTMLElement;
    scoreValueEl: HTMLElement;
    scoreStatusEl: HTMLElement;
    targetScore: number;
    targetBandLabel: string;
    driverTextsEl: HTMLElement;
    targetDriverScores: number[];
    driverMessages: Record<DashboardMomentumDriverKey, string>;
    statusLabel?: string;
    startDriverScores?: number[];
  }) {
    const startScore = getCurrentMomentumDisplayedScore(opts.dialEl, opts.arcActiveEl);
    const startDriverScores = opts.startDriverScores || [0, 0, 0, 0];
    cancelMomentumAnimation();
    renderMomentumDriverRows(opts.driverTextsEl, startDriverScores, {
      interactive: true,
      selectedKey: selectedMomentumDriverKey,
      messages: opts.driverMessages,
    });
    applyMomentumVisualState({
      dialEl: opts.dialEl,
      arcActiveEl: opts.arcActiveEl,
      needleEl: opts.needleEl,
      scoreValueEl: opts.scoreValueEl,
      scoreStatusEl: opts.scoreStatusEl,
      score: startScore,
      ariaBandLabel: opts.targetBandLabel,
      statusLabel: opts.statusLabel,
    });
    momentumAnimationFrameId = window.requestAnimationFrame((firstFrameTime) => {
      const startTime = firstFrameTime;
      const tick = (frameTime: number) => {
        const elapsed = Math.max(0, frameTime - startTime);
        const progress = Math.max(0, Math.min(1, elapsed / MOMENTUM_ANIMATION_DURATION_MS));
        const eased = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        const displayedScore = startScore + (opts.targetScore - startScore) * eased;
        const displayedDriverScores = opts.targetDriverScores.map((score, index) => {
          const startDriverScore = Number(startDriverScores[index] || 0);
          return startDriverScore + (score - startDriverScore) * eased;
        });
        renderMomentumDriverRows(opts.driverTextsEl, progress >= 1 ? opts.targetDriverScores : displayedDriverScores, {
          interactive: true,
          selectedKey: selectedMomentumDriverKey,
          messages: opts.driverMessages,
        });
        applyMomentumVisualState({
          dialEl: opts.dialEl,
          arcActiveEl: opts.arcActiveEl,
          needleEl: opts.needleEl,
          scoreValueEl: opts.scoreValueEl,
          scoreStatusEl: opts.scoreStatusEl,
          score: progress >= 1 ? opts.targetScore : displayedScore,
          ariaBandLabel: opts.targetBandLabel,
          statusLabel: opts.statusLabel,
        });
        if (progress >= 1) {
          momentumAnimationFrameId = null;
          return;
        }
        momentumAnimationFrameId = window.requestAnimationFrame(tick);
      };
      tick(firstFrameTime);
    });
  }

  function renderDashboardWeeklyGoalsCard() {
    const valueEl = els.dashboardWeeklyGoalsValue as HTMLElement | null;
    const metaEl = els.dashboardWeeklyGoalsMeta as HTMLElement | null;
    const progressBarEl = els.dashboardWeeklyGoalsProgressBar as HTMLElement | null;
    const projectionMarkerEl = els.dashboardWeeklyGoalsProjectionMarker as HTMLElement | null;
    const projectionFillEl = els.dashboardWeeklyGoalsProjectionFill as HTMLElement | null;
    const progressFillEl = els.dashboardWeeklyGoalsProgressFill as HTMLElement | null;
    const progressTextEl = els.dashboardWeeklyGoalsProgressText as HTMLElement | null;
    const trendIndicatorEl = document.getElementById("dashboardWeeklyTrendIndicator") as HTMLElement | null;
    const historyByTaskId = ctx.getHistoryByTaskId();

    const nowValue = nowMs();
    const weekStartMs = startOfCurrentWeekMs(nowValue, ctx.getWeekStarting());
    const prevWeekEndMs = weekStartMs;
    const prevWeekStartMs = prevWeekEndMs - 7 * 86400000;
    const goalTasks = getDashboardFilteredTasks().filter((task) => {
      if (!task) return false;
      if (!task.timeGoalEnabled) return false;
      const goalMinutes = Math.max(0, Number(task.timeGoalMinutes || 0));
      if (goalMinutes <= 0) return false;
      return task.timeGoalPeriod === "day" || task.timeGoalPeriod === "week";
    });

    const totalGoalMs = goalTasks.reduce((sum, task) => {
      const goalMinutes = Math.max(0, Number(task.timeGoalMinutes || 0));
      const multiplier = task.timeGoalPeriod === "day" ? 7 : 1;
      return sum + goalMinutes * 60000 * multiplier;
    }, 0);

    const loggedMs = goalTasks.reduce((sum, task) => {
      const taskId = String(task.id || "").trim();
      if (!taskId) return sum;
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      const taskWeekMs = entries.reduce((entrySum, entry: any) => {
        const ts = ctx.normalizeHistoryTimestampMs(entry?.ts);
        const ms = Math.max(0, Number(entry?.ms) || 0);
        if (!Number.isFinite(ts) || ts < weekStartMs || ts > nowValue) return entrySum;
        if (!Number.isFinite(ms) || ms <= 0) return entrySum;
        return entrySum + ms;
      }, 0);
      return sum + taskWeekMs;
    }, 0);
    const prevWeekLoggedMs = goalTasks.reduce((sum, task) => {
      const taskId = String(task.id || "").trim();
      if (!taskId) return sum;
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      const taskPrevWeekMs = entries.reduce((entrySum, entry: any) => {
        const ts = ctx.normalizeHistoryTimestampMs(entry?.ts);
        const ms = Math.max(0, Number(entry?.ms) || 0);
        if (!Number.isFinite(ts) || ts < prevWeekStartMs || ts >= prevWeekEndMs) return entrySum;
        if (!Number.isFinite(ms) || ms <= 0) return entrySum;
        return entrySum + ms;
      }, 0);
      return sum + taskPrevWeekMs;
    }, 0);

    const runningMs = goalTasks.reduce((sum, task) => {
      if (!task?.running) return sum;
      return sum + Math.max(0, ctx.getElapsedMs(task));
    }, 0);

    const projectedMs = loggedMs + runningMs;
    const progressPct = totalGoalMs > 0 ? Math.max(0, Math.min(100, Math.round((loggedMs / totalGoalMs) * 100))) : 0;
    const projectedPct = totalGoalMs > 0 ? Math.max(0, Math.min(100, Math.round((projectedMs / totalGoalMs) * 100))) : 0;
    const showProjectionMarker = totalGoalMs > 0 && runningMs > 0;
    const projectedDeltaPct = showProjectionMarker ? Math.max(0, projectedPct - progressPct) : 0;
    const trendDeltaPct = applyDashboardTrendIndicator(trendIndicatorEl, loggedMs, prevWeekLoggedMs);
    if (valueEl) valueEl.textContent = formatDashboardDurationWithMinutes(loggedMs);
    if (metaEl) {
      metaEl.textContent = "";
      metaEl.style.display = "none";
    }
    if (progressFillEl) progressFillEl.style.width = `${progressPct}%`;
    if (projectionFillEl) {
      if (showProjectionMarker && projectedDeltaPct > 0) {
        projectionFillEl.style.display = "";
        projectionFillEl.style.left = `${progressPct}%`;
        projectionFillEl.style.width = `${projectedDeltaPct}%`;
      } else {
        projectionFillEl.style.display = "none";
        projectionFillEl.style.left = "0%";
        projectionFillEl.style.width = "0%";
      }
    }
    if (projectionMarkerEl) {
      if (showProjectionMarker) {
        projectionMarkerEl.style.display = "";
        projectionMarkerEl.classList.toggle("isAtEnd", projectedPct >= 100);
        if (projectedPct >= 100) projectionMarkerEl.style.left = "";
        else projectionMarkerEl.style.left = `${projectedPct}%`;
      } else {
        projectionMarkerEl.style.display = "none";
        projectionMarkerEl.classList.remove("isAtEnd");
        projectionMarkerEl.style.left = "";
      }
    }
    if (progressBarEl) {
      progressBarEl.setAttribute("aria-valuenow", String(progressPct));
      progressBarEl.setAttribute(
        "aria-label",
        totalGoalMs > 0
          ? showProjectionMarker
            ? `Weekly time goal progress: ${formatDashboardDurationShort(loggedMs)} of ${formatDashboardDurationShort(totalGoalMs)} logged, ${formatDashboardDurationShort(projectedMs)} projected if running tasks are logged`
            : `Weekly time goal progress: ${formatDashboardDurationShort(loggedMs)} of ${formatDashboardDurationShort(totalGoalMs)} logged`
          : "Weekly time goal progress: no weekly time goals enabled"
      );
    }
    if (progressTextEl) {
      progressTextEl.textContent = totalGoalMs > 0 ? `${progressPct}% of weekly goal logged` : "No weekly time goals enabled";
    }
    const cardEl = trendIndicatorEl?.closest(".dashboardWeeklyGoalsCard") as HTMLElement | null;
    if (cardEl) {
      const trendSummary =
        trendDeltaPct == null ? "Trend unavailable versus previous week." : `${trendDeltaPct >= 0 ? "+" : ""}${trendDeltaPct}% versus previous week.`;
      cardEl.setAttribute("aria-label", `Weekly logged time and time goal progress. ${trendSummary}`);
    }
  }

  function renderDashboardMomentumCard() {
    const cardEl = els.dashboardMomentumCard as HTMLElement | null;
    const dialEl = els.dashboardMomentumDial as HTMLElement | null;
    const arcActiveEl = els.dashboardMomentumArcActive as SVGPathElement | null;
    const needleEl = els.dashboardMomentumNeedle as HTMLElement | null;
    const scoreValueEl = els.dashboardMomentumScoreValue as HTMLElement | null;
    const scoreStatusEl = els.dashboardMomentumScoreStatus as HTMLElement | null;
    const driverTextsEl = els.dashboardMomentumDrivers as HTMLElement | null;
    const footerMessageEl = els.dashboardMomentumFooterMessage as HTMLElement | null;
    if (!cardEl || !dialEl || !arcActiveEl || !needleEl || !scoreValueEl || !scoreStatusEl || !driverTextsEl) return;

    if (!hasAdvancedInsights()) {
      cancelMomentumAnimation();
      clearSelectedMomentumDriverResetTimer();
      selectedMomentumDriverKey = null;
      lastMomentumAnimatedTargetScore = null;
      lastMomentumAnimatedTargetBand = null;
      setDashboardPlanLockedState(cardEl, true);
      dialEl.style.setProperty("--momentum-score", "0");
      dialEl.style.setProperty("--momentum-locked", "1");
      dialEl.setAttribute("aria-label", "Momentum dial locked. Upgrade to Pro to view the score.");
      arcActiveEl.setAttribute("stroke-dasharray", "68 100");
      needleEl.style.setProperty("--momentum-needle-deg", "58deg");
      const lockedDriverScores = [17, 31, 12, 8];
      const lockedSignature = JSON.stringify({
        locked: true,
        score: "68",
        status: "Example",
        needle: "58deg",
        drivers: lockedDriverScores,
      });
      if (lastMomentumRenderSignature === lockedSignature) return;
      lastMomentumRenderSignature = lockedSignature;
      scoreValueEl.textContent = "68";
      scoreStatusEl.textContent = "Example";
      renderMomentumDriverRows(driverTextsEl, lockedDriverScores);
      renderMomentumFooterMessage(
        footerMessageEl,
        "Momentum examples show how recent activity, consistency, weekly progress, and live bonus combine into one score."
      );
      return;
    }

    setDashboardPlanLockedState(cardEl, false);
    dialEl.style.setProperty("--momentum-locked", "0");

    const nowValue = nowMs();
    const momentum = computeMomentumSnapshot({
      tasks: ctx.getTasks(),
      historyByTaskId: ctx.getHistoryByTaskId(),
      weekStarting: ctx.getWeekStarting(),
      includedModes: ctx.getDashboardIncludedModes(),
      isModeEnabled: ctx.isModeEnabled,
      taskModeOf: ctx.taskModeOf,
      nowValue,
    });
    const score = momentum.score;
    const hasSignal = momentum.hasSignal;
    if (shouldHoldDashboardWidget("momentum", hasSignal)) return;

    const bandLabel = getMomentumBandLabel(score);
    const nextDriverScores = [
      momentum.recentActivityScore,
      momentum.consistencyScore,
      momentum.weeklyProgressScore,
      momentum.activeSessionBonus,
    ];
    const driverMessages = buildMomentumDriverMessages(momentum);
    const defaultSummaryMessage = buildMomentumSummaryMessage(momentum);
    const selectedDriverIndex = selectedMomentumDriverKey
      ? MOMENTUM_DRIVER_DEFS.findIndex((driver) => driver.key === selectedMomentumDriverKey)
      : -1;
    if (selectedMomentumDriverKey && selectedDriverIndex < 0) {
      selectedMomentumDriverKey = null;
    }
    if (selectedMomentumDriverKey && selectedDriverIndex >= 0) {
      const selectedDriverScore = nextDriverScores[selectedDriverIndex] || 0;
      const selectedDriver = MOMENTUM_DRIVER_DEFS[selectedDriverIndex]!;
      const selectedBandLabel = `${selectedDriver.label} focus`;
      const selectedSignature = JSON.stringify({
        locked: false,
        score,
        status: bandLabel,
        selectedDriver: selectedMomentumDriverKey,
        selectedScore: Math.round(selectedDriverScore),
        drivers: nextDriverScores.map((value) => Math.round(value)),
      });
      const isSameSelectedTarget = lastMomentumRenderSignature === selectedSignature;
      const shouldSuppressSelectedAnimation = ctx.getDashboardRefreshHoldActive() || !!ctx.getCloudRefreshInFlight();
      lastMomentumRenderSignature = JSON.stringify({
        locked: false,
        score,
        status: bandLabel,
        selectedDriver: selectedMomentumDriverKey,
        selectedScore: Math.round(selectedDriverScore),
        drivers: nextDriverScores.map((value) => Math.round(value)),
      });
      renderMomentumDriverRows(driverTextsEl, nextDriverScores, {
        interactive: true,
        selectedKey: selectedMomentumDriverKey,
        messages: driverMessages,
      });
      renderMomentumFooterMessage(footerMessageEl, driverMessages[selectedDriver.key] || defaultSummaryMessage);
      if (!isSameSelectedTarget && !shouldSuppressSelectedAnimation) {
        animateMomentumToScore({
          dialEl,
          arcActiveEl,
          needleEl,
          scoreValueEl,
          scoreStatusEl,
          targetScore: selectedDriverScore,
          targetBandLabel: selectedBandLabel,
          driverTextsEl,
          targetDriverScores: nextDriverScores,
          driverMessages,
          startDriverScores: nextDriverScores,
        });
      } else {
        cancelMomentumAnimation();
        applyMomentumVisualState({
          dialEl,
          arcActiveEl,
          needleEl,
          scoreValueEl,
          scoreStatusEl,
          score: selectedDriverScore,
          ariaBandLabel: selectedBandLabel,
          statusLabel: selectedDriver.label,
        });
      }
      return;
    }
    const isReturningFromSelectedDriver = lastMomentumRenderSignature.includes('"selectedDriver":');
    const nextSignature = JSON.stringify({
      locked: false,
      score,
      status: bandLabel,
      needle: `${getMomentumNeedleDeg(score)}deg`,
      drivers: nextDriverScores.map((value) => Math.round(value)),
    });
    const isSameTarget = lastMomentumRenderSignature === nextSignature;
    if (!isSameTarget) {
      renderMomentumDriverRows(driverTextsEl, nextDriverScores, { interactive: true, messages: driverMessages });
    }

    const hasAnimatedBefore = lastMomentumAnimatedTargetScore != null;
    const scoreDelta = hasAnimatedBefore ? Math.abs(score - (lastMomentumAnimatedTargetScore || 0)) : score;
    const bandChanged = hasAnimatedBefore ? bandLabel !== lastMomentumAnimatedTargetBand : score > 0;
    const shouldSuppressAnimation = ctx.getDashboardRefreshHoldActive() || !!ctx.getCloudRefreshInFlight();
    const shouldAnimate =
      score > 0 &&
      (!hasAnimatedBefore || scoreDelta >= MOMENTUM_MEANINGFUL_DELTA || bandChanged || isReturningFromSelectedDriver) &&
      !shouldSuppressAnimation &&
      !isSameTarget;

    renderMomentumFooterMessage(footerMessageEl, defaultSummaryMessage);
    if (!shouldAnimate && isSameTarget) return;

    lastMomentumRenderSignature = nextSignature;
    lastMomentumAnimatedTargetScore = score;
    lastMomentumAnimatedTargetBand = bandLabel;

    if (shouldAnimate) {
      animateMomentumToScore({
        dialEl,
        arcActiveEl,
        needleEl,
        scoreValueEl,
        scoreStatusEl,
        targetScore: score,
        targetBandLabel: bandLabel,
        driverTextsEl,
        targetDriverScores: nextDriverScores,
        driverMessages,
        startDriverScores: isReturningFromSelectedDriver ? nextDriverScores : undefined,
      });
      return;
    }

    cancelMomentumAnimation();
    renderMomentumDriverRows(driverTextsEl, nextDriverScores, { interactive: true, messages: driverMessages });
    renderMomentumFooterMessage(footerMessageEl, defaultSummaryMessage);
    applyMomentumVisualState({
      dialEl,
      arcActiveEl,
      needleEl,
      scoreValueEl,
      scoreStatusEl,
      score,
      ariaBandLabel: bandLabel,
    });
  }

  function applyDashboardGoalProgressUi(opts: {
    progressBarEl: HTMLElement | null;
    progressFillEl: HTMLElement | null;
    projectionFillEl: HTMLElement | null;
    projectionMarkerEl: HTMLElement | null;
    goalTotalMs: number;
    loggedMs: number;
    projectedMs: number;
    runningMs: number;
    emptyLabel: string;
    activeLabel: string;
    projectedLabel?: string;
  }) {
    const {
      progressBarEl,
      progressFillEl,
      projectionFillEl,
      projectionMarkerEl,
      goalTotalMs,
      loggedMs,
      projectedMs,
      runningMs,
      emptyLabel,
      activeLabel,
      projectedLabel,
    } = opts;

    const progressPct = goalTotalMs > 0 ? Math.max(0, Math.min(100, Math.round((loggedMs / goalTotalMs) * 100))) : 0;
    const projectedPct = goalTotalMs > 0 ? Math.max(0, Math.min(100, Math.round((projectedMs / goalTotalMs) * 100))) : 0;
    const showProjectionMarker = goalTotalMs > 0 && runningMs > 0;
    const projectedDeltaPct = showProjectionMarker ? Math.max(0, projectedPct - progressPct) : 0;

    if (progressFillEl) progressFillEl.style.width = `${progressPct}%`;
    if (projectionFillEl) {
      if (showProjectionMarker && projectedDeltaPct > 0) {
        projectionFillEl.style.display = "";
        projectionFillEl.style.left = `${progressPct}%`;
        projectionFillEl.style.width = `${projectedDeltaPct}%`;
      } else {
        projectionFillEl.style.display = "none";
        projectionFillEl.style.left = "0%";
        projectionFillEl.style.width = "0%";
      }
    }
    if (projectionMarkerEl) {
      if (showProjectionMarker) {
        projectionMarkerEl.style.display = "";
        projectionMarkerEl.classList.toggle("isAtEnd", projectedPct >= 100);
        if (projectedPct >= 100) projectionMarkerEl.style.left = "";
        else projectionMarkerEl.style.left = `${projectedPct}%`;
      } else {
        projectionMarkerEl.style.display = "none";
        projectionMarkerEl.classList.remove("isAtEnd");
        projectionMarkerEl.style.left = "";
      }
    }
    if (progressBarEl) {
      progressBarEl.setAttribute("aria-valuenow", String(progressPct));
      progressBarEl.setAttribute(
        "aria-label",
        goalTotalMs > 0
          ? showProjectionMarker
            ? `${activeLabel}: ${formatDashboardDurationShort(loggedMs)} of ${formatDashboardDurationShort(goalTotalMs)} logged, ${formatDashboardDurationShort(projectedMs)} ${projectedLabel || "projected if running tasks are logged"}`
            : `${activeLabel}: ${formatDashboardDurationShort(loggedMs)} of ${formatDashboardDurationShort(goalTotalMs)} logged`
          : emptyLabel
      );
    }

    return { progressPct, projectedPct, showProjectionMarker };
  }

  function renderDashboardTasksCompletedCard() {
    const valueEl = document.getElementById("dashboardTasksCompletedValue") as HTMLElement | null;
    const metaEl = document.getElementById("dashboardTasksCompletedMeta") as HTMLElement | null;
    const cardEl = valueEl?.closest(".dashboardTasksCompletedCard") as HTMLElement | null;
    const historyByTaskId = ctx.getHistoryByTaskId();
    const nowValue = nowMs();
    const weekStartMs = startOfCurrentWeekMs(nowValue, ctx.getWeekStarting());
    const goalTasks = getDashboardFilteredTasks().filter((task) => {
      if (!task) return false;
      if (!task.timeGoalEnabled) return false;
      const goalMinutes = Math.max(0, Number(task.timeGoalMinutes || 0));
      if (goalMinutes <= 0) return false;
      return task.timeGoalPeriod === "day" || task.timeGoalPeriod === "week";
    });

    const dailyTaskGoalMinutes = new Map<string, number>();
    const weeklyTaskGoalMinutes = new Map<string, number>();
    goalTasks.forEach((task) => {
      const taskId = String(task.id || "").trim();
      if (!taskId) return;
      const goalMinutes = Math.max(0, Number(task.timeGoalMinutes || 0));
      if (task.timeGoalPeriod === "day") dailyTaskGoalMinutes.set(taskId, goalMinutes);
      else if (task.timeGoalPeriod === "week") weeklyTaskGoalMinutes.set(taskId, goalMinutes);
    });

    const dailyLoggedMsByTaskDay = new Map<string, Map<string, number>>();
    const weeklyLoggedMsByTask = new Map<string, number>();

    goalTasks.forEach((task) => {
      const taskId = String(task.id || "").trim();
      if (!taskId) return;
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      entries.forEach((entry: any) => {
        const ts = ctx.normalizeHistoryTimestampMs(entry?.ts);
        const ms = Math.max(0, Number(entry?.ms) || 0);
        if (!Number.isFinite(ts) || ts < weekStartMs || ts > nowValue) return;
        if (!Number.isFinite(ms) || ms <= 0) return;
        if (dailyTaskGoalMinutes.has(taskId)) {
          const dayKey = localDayKey(ts);
          let byDay = dailyLoggedMsByTaskDay.get(taskId);
          if (!byDay) {
            byDay = new Map<string, number>();
            dailyLoggedMsByTaskDay.set(taskId, byDay);
          }
          byDay.set(dayKey, (byDay.get(dayKey) || 0) + ms);
        }
        if (weeklyTaskGoalMinutes.has(taskId)) {
          weeklyLoggedMsByTask.set(taskId, (weeklyLoggedMsByTask.get(taskId) || 0) + ms);
        }
      });
    });

    let dailyCompletedDays = 0;
    dailyLoggedMsByTaskDay.forEach((byDay, taskId) => {
      const goalMinutes = dailyTaskGoalMinutes.get(taskId) || 0;
      if (!(goalMinutes > 0)) return;
      byDay.forEach((loggedMs) => {
        if (loggedMs >= goalMinutes * 60000) dailyCompletedDays += 1;
      });
    });

    let weeklyCompletedTasks = 0;
    weeklyLoggedMsByTask.forEach((loggedMs, taskId) => {
      const goalMinutes = weeklyTaskGoalMinutes.get(taskId) || 0;
      if (goalMinutes > 0 && loggedMs >= goalMinutes * 60000) weeklyCompletedTasks += 1;
    });

    const totalCompleted = dailyCompletedDays + weeklyCompletedTasks;
    const hasData = totalCompleted > 0;
    if (shouldHoldDashboardWidget("tasksCompleted", hasData)) return;

    if (valueEl) valueEl.textContent = String(totalCompleted);
    if (metaEl) {
      metaEl.textContent = "";
      metaEl.style.display = "none";
    }
    if (cardEl) {
      cardEl.setAttribute(
        "aria-label",
        totalCompleted > 0
          ? `Task completion. ${totalCompleted} goal completions this week: ${dailyCompletedDays} daily and ${weeklyCompletedTasks} weekly.`
          : "Task completion. No weekly goal completions yet."
      );
    }
  }

  function renderDashboardTodayHoursCard() {
    const titleEl = document.getElementById("dashboardTodayHoursTitle") as HTMLElement | null;
    const valueEl = document.getElementById("dashboardTodayHoursValue") as HTMLElement | null;
    const metaEl = document.getElementById("dashboardTodayHoursMeta") as HTMLElement | null;
    const deltaEl = document.getElementById("dashboardTodayHoursDelta") as HTMLElement | null;
    const trendIndicatorEl = document.getElementById("dashboardTodayTrendIndicator") as HTMLElement | null;
    const progressBarEl = document.getElementById("dashboardTodayHoursProgressBar") as HTMLElement | null;
    const projectionMarkerEl = document.getElementById("dashboardTodayHoursProjectionMarker") as HTMLElement | null;
    const projectionFillEl = document.getElementById("dashboardTodayHoursProjectionFill") as HTMLElement | null;
    const progressFillEl = document.getElementById("dashboardTodayHoursProgressFill") as HTMLElement | null;
    const historyByTaskId = ctx.getHistoryByTaskId();
    const nowValue = nowMs();
    const todayStartDate = new Date(nowValue);
    todayStartDate.setHours(0, 0, 0, 0);
    const todayStartMs = todayStartDate.getTime();
    const elapsedTodayMs = Math.max(0, nowValue - todayStartMs);
    const yesterdayStartMs = todayStartMs - 86400000;
    const yesterdaySameTimeCutoffMs = yesterdayStartMs + elapsedTodayMs;
    const todayKey = localDayKey(nowValue);
    const yesterdayDate = new Date(nowValue);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayKey = localDayKey(yesterdayDate.getTime());
    const includedTaskIds = new Set(
      getDashboardFilteredTasks()
        .map((task) => String(task?.id || "").trim())
        .filter(Boolean)
    );
    const dailyGoalTasks = getDashboardFilteredTasks().filter((task) => {
      if (!task) return false;
      if (!task.timeGoalEnabled) return false;
      if (task.timeGoalPeriod !== "day") return false;
      return Math.max(0, Number(task.timeGoalMinutes || 0)) > 0;
    });
    const totalDailyGoalMs = dailyGoalTasks.reduce((sum, task) => sum + Math.max(0, Number(task.timeGoalMinutes || 0)) * 60000, 0);

    let todayLoggedMs = 0;
    let yesterdaySameTimeMs = 0;
    includedTaskIds.forEach((taskId) => {
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      entries.forEach((entry: any) => {
        const ts = ctx.normalizeHistoryTimestampMs(entry?.ts);
        const ms = Math.max(0, Number(entry?.ms) || 0);
        if (!Number.isFinite(ts) || ms <= 0) return;
        const entryDayKey = localDayKey(ts);
        if (entryDayKey === todayKey) todayLoggedMs += ms;
        else if (entryDayKey === yesterdayKey && ts <= yesterdaySameTimeCutoffMs) yesterdaySameTimeMs += ms;
      });
    });
    const todayInProgressMs = getDashboardFilteredTasks().reduce((sum, task) => {
      const taskId = String(task?.id || "").trim();
      if (!taskId || !includedTaskIds.has(taskId)) return sum;
      const elapsedMs = Math.max(0, ctx.getElapsedMs(task));
      if (elapsedMs <= 0) return sum;
      return sum + elapsedMs;
    }, 0);
    const todayMs = todayLoggedMs + todayInProgressMs;
    const dailyGoalLoggedMs = dailyGoalTasks.reduce((sum, task) => {
      const taskId = String(task.id || "").trim();
      if (!taskId) return sum;
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      const taskTodayMs = entries.reduce((entrySum, entry: any) => {
        const ts = ctx.normalizeHistoryTimestampMs(entry?.ts);
        const ms = Math.max(0, Number(entry?.ms) || 0);
        if (!Number.isFinite(ts) || ms <= 0) return entrySum;
        return localDayKey(ts) === todayKey ? entrySum + ms : entrySum;
      }, 0);
      return sum + taskTodayMs;
    }, 0);
    const dailyGoalInProgressMs = dailyGoalTasks.reduce((sum, task) => {
      const elapsedMs = Math.max(0, ctx.getElapsedMs(task));
      if (elapsedMs <= 0) return sum;
      return sum + elapsedMs;
    }, 0);
    const dailyGoalProjectedMs = dailyGoalLoggedMs + dailyGoalInProgressMs;

    if (titleEl) titleEl.textContent = "Today";
    if (valueEl) valueEl.textContent = formatDashboardDurationShort(todayMs);
    const trendDeltaPct = applyDashboardTrendIndicator(trendIndicatorEl, todayMs, yesterdaySameTimeMs);
    applyDashboardGoalProgressUi({
      progressBarEl,
      progressFillEl,
      projectionFillEl,
      projectionMarkerEl,
      goalTotalMs: totalDailyGoalMs,
      loggedMs: dailyGoalLoggedMs,
      projectedMs: dailyGoalProjectedMs,
      runningMs: dailyGoalInProgressMs,
      emptyLabel: "Today's time goal progress: no daily time goals enabled",
      activeLabel: "Today's time goal progress",
      projectedLabel: "projected if running tasks are logged",
    });
    if (metaEl) {
      if (totalDailyGoalMs > 0) {
        metaEl.textContent = "";
        metaEl.style.display = "none";
      } else {
        metaEl.textContent = "";
        metaEl.style.display = "none";
      }
    }
    const cardEl = trendIndicatorEl?.closest(".dashboardWeekHoursCard") as HTMLElement | null;
    if (cardEl) {
      const trendSummary =
        trendDeltaPct == null ? "Trend unavailable versus this time yesterday." : `${trendDeltaPct > 0 ? "+" : ""}${trendDeltaPct}% versus this time yesterday.`;
      cardEl.setAttribute("aria-label", `Today's logged time. ${trendSummary}`);
    }
    if (!deltaEl) return;

    deltaEl.classList.remove("positive", "negative");
    if (todayMs <= 0 && yesterdaySameTimeMs <= 0) {
      deltaEl.textContent = "No time logged today";
      return;
    }
    if (yesterdaySameTimeMs <= 0) {
      if (todayMs > 0) {
        deltaEl.textContent = `+${formatDashboardDurationShort(todayMs)} vs this time yesterday`;
        deltaEl.classList.add("positive");
      } else {
        deltaEl.textContent = "Same as this time yesterday";
      }
      return;
    }

    const deltaMs = todayMs - yesterdaySameTimeMs;
    const deltaText = formatDashboardDurationShort(Math.abs(deltaMs));
    if (deltaMs > 0) {
      deltaEl.textContent = `+${deltaText} vs this time yesterday`;
      deltaEl.classList.add("positive");
      return;
    }
    if (deltaMs < 0) {
      deltaEl.textContent = `-${deltaText} vs this time yesterday`;
      deltaEl.classList.add("negative");
      return;
    }
    deltaEl.textContent = "Same as this time yesterday";
  }

  function renderDashboardTimelineCard() {
    const listEl = els.dashboardTimelineList as HTMLElement | null;
    const noteEl = els.dashboardTimelineNote as HTMLElement | null;
    const summaryEl = els.dashboardTimelineSummary as HTMLElement | null;
    const cardEl = listEl?.closest(".dashboardTimelineCard") as HTMLElement | null;
    if (!hasAdvancedInsights()) {
      setDashboardPlanLockedState(cardEl, true);
      renderLockedTimelineMock(cardEl, listEl, noteEl, summaryEl);
      return;
    }
    setDashboardPlanLockedState(cardEl, false);
    const historyByTaskId = ctx.getHistoryByTaskId();
    if (!listEl) return;

    const density = sanitizeDashboardTimelineDensity(ctx.getDashboardTimelineDensity());
    ctx.setDashboardTimelineDensity(density);
    const targetCount = getDashboardTimelineDensityTarget(density);
    const densityButtons = cardEl
      ? (Array.from(cardEl.querySelectorAll("[data-dashboard-timeline-density]")) as HTMLButtonElement[])
      : [];
    densityButtons.forEach((button) => {
      const buttonDensity = sanitizeDashboardTimelineDensity(button.getAttribute("data-dashboard-timeline-density"));
      const isOn = buttonDensity === density;
      button.classList.toggle("isOn", isOn);
      button.setAttribute("aria-pressed", isOn ? "true" : "false");
      button.setAttribute("title", `${dashboardTimelineDensityLabel(buttonDensity)} density`);
    });

    const nowValue = nowMs();
    const thirtyDaysAgoMs = nowValue - 30 * 86400000;
    const showWeekendRoutine = [0, 6].includes(new Date(nowValue).getDay());
    const minimumActivityDays = 4;
    const preferredBranchMinimumDistinctDays = 2;
    const fallbackMinimumDistinctDays = 2;
    const bucketSizeMinutes = 60;
    const minimumSessionMs = 10 * 60 * 1000;
    type TimelineBucketStats = {
      taskName: string;
      distinctDayKeys: Set<string>;
      totalMs: number;
      sessionCount: number;
      weightedMinuteSum: number;
      durationEntriesMs: number[];
    };
    type TimelineBucketMap = Map<number, Map<string, TimelineBucketStats>>;
    type TimelineSuggestionItem = {
      selectionKey: string;
      taskId: string;
      taskName: string;
      distinctDays: number;
      windowDistinctDays: number;
      totalMs: number;
      sessionCount: number;
      suggestedMinute: number;
      bucketIndex: number;
      avgDurationMs: number;
      segmentStartMinute: number;
      segmentEndMinute: number;
      maxStartMinute: number;
      maxEndMinute: number;
      goalStartMinute: number | null;
      goalEndMinute: number | null;
      isPreferredBranch: boolean;
      colorIndex: number;
      displayDurationMinutes: number;
      displayDurationText: string;
    };
    const bucketMap: TimelineBucketMap = new Map();
    const fallbackBucketMap: TimelineBucketMap = new Map();
    const matchedDayKeys = new Set<string>();
    const fallbackMatchedDayKeys = new Set<string>();
    const timeGoalMinutesByTaskId = new Map<string, number>();

    const formatTimelineClockMinute = (minuteRaw: number, opts?: { end?: boolean }) => {
      const boundedMinute = Math.max(0, Math.min(1440, Math.round(minuteRaw)));
      const normalizedMinute = boundedMinute === 1440 ? 0 : boundedMinute;
      const hours = boundedMinute === 1440 ? 24 : Math.floor(normalizedMinute / 60);
      const minutes = normalizedMinute % 60;
      if (opts?.end && boundedMinute === 1440) return "24:00";
      return `${formatTwo(hours)}:${formatTwo(minutes)}`;
    };

    const getTimelineSegmentRangeLabel = (startMinute: number, endMinute: number) =>
      `${formatTimelineClockMinute(startMinute)} - ${formatTimelineClockMinute(endMinute, { end: true })}`;

    const formatTimelineDurationLabel = (durationMinutesRaw: number) => {
      const totalMinutes = Math.max(1, Math.round(durationMinutesRaw) || 1);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
      if (hours > 0) return `${hours}h`;
      return `${totalMinutes}m`;
    };

    const addTimelineEntryToBucketMap = (
      targetBucketMap: TimelineBucketMap,
      bucketIndex: number,
      taskId: string,
      taskName: string,
      dayKey: string,
      minuteOfDay: number,
      ms: number
    ) => {
      let bucket = targetBucketMap.get(bucketIndex);
      if (!bucket) {
        bucket = new Map();
        targetBucketMap.set(bucketIndex, bucket);
      }
      let stats = bucket.get(taskId);
      if (!stats) {
        stats = {
          taskName,
          distinctDayKeys: new Set<string>(),
          totalMs: 0,
          sessionCount: 0,
          weightedMinuteSum: 0,
          durationEntriesMs: [],
        };
        bucket.set(taskId, stats);
      }
      stats.distinctDayKeys.add(dayKey);
      stats.totalMs += ms;
      stats.sessionCount += 1;
      stats.weightedMinuteSum += minuteOfDay * ms;
      stats.durationEntriesMs.push(ms);
    };

    const getMedianDurationMs = (durationsMs: number[]) => {
      const normalized = durationsMs
        .map((value) => Math.max(0, Math.round(Number(value) || 0)))
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((a, b) => a - b);
      if (!normalized.length) return minimumSessionMs;
      const middleIndex = Math.floor(normalized.length / 2);
      if (normalized.length % 2 === 1) return normalized[middleIndex]!;
      return Math.round((normalized[middleIndex - 1]! + normalized[middleIndex]!) / 2);
    };

    const buildTimelineItems = (targetBucketMap: TimelineBucketMap, minimumDistinctDays: number): TimelineSuggestionItem[] =>
      Array.from(targetBucketMap.entries())
        .flatMap(([bucketIndex, taskMap]) => {
          const ranked = Array.from(taskMap.entries())
            .map(([taskId, stats]) => ({
              taskId,
              taskName: stats.taskName,
              distinctDays: stats.distinctDayKeys.size,
              windowDistinctDays: stats.distinctDayKeys.size,
              totalMs: stats.totalMs,
              sessionCount: stats.sessionCount,
              avgDurationMs: getMedianDurationMs(stats.durationEntriesMs),
              suggestedMinute:
                stats.totalMs > 0
                  ? Math.max(0, Math.min(1439, Math.round(stats.weightedMinuteSum / stats.totalMs)))
                  : bucketIndex * bucketSizeMinutes,
            }))
            .filter((row) => row.windowDistinctDays >= minimumDistinctDays)
            .sort((a, b) => {
              if (b.windowDistinctDays !== a.windowDistinctDays) return b.windowDistinctDays - a.windowDistinctDays;
              if (b.distinctDays !== a.distinctDays) return b.distinctDays - a.distinctDays;
              if (b.totalMs !== a.totalMs) return b.totalMs - a.totalMs;
              if (b.sessionCount !== a.sessionCount) return b.sessionCount - a.sessionCount;
              return a.taskName.localeCompare(b.taskName);
            });
          return ranked.map((candidate) => {
            const medianDurationMinutes = Math.max(1, Math.round((candidate.avgDurationMs / 60000) || 1));
            const halfDurationMinutes = medianDurationMinutes / 2;
            const startMinute = Math.max(0, Math.round(candidate.suggestedMinute - halfDurationMinutes));
            const endMinute = Math.min(1440, Math.round(candidate.suggestedMinute + halfDurationMinutes));
            const normalizedSegmentStartMinute = Math.max(0, Math.min(1439, startMinute));
            const normalizedSegmentEndMinute = Math.max(normalizedSegmentStartMinute + 1, endMinute);
            const goalDurationMinutes = Math.round(timeGoalMinutesByTaskId.get(candidate.taskId) || 0);
            const goalHalfDurationMinutes = goalDurationMinutes / 2;
            const goalStartMinuteRaw = Math.max(0, Math.round(candidate.suggestedMinute - goalHalfDurationMinutes));
            const goalEndMinuteRaw = Math.min(1440, Math.round(candidate.suggestedMinute + goalHalfDurationMinutes));
            const hasExtendedGoal = goalDurationMinutes > medianDurationMinutes;
            return {
              ...candidate,
              selectionKey: `${candidate.taskId}:${bucketIndex}`,
              bucketIndex,
              segmentStartMinute: normalizedSegmentStartMinute,
              segmentEndMinute: normalizedSegmentEndMinute,
              maxStartMinute: hasExtendedGoal
                ? Math.max(0, Math.min(1439, goalStartMinuteRaw))
                : normalizedSegmentStartMinute,
              maxEndMinute: hasExtendedGoal
                ? Math.max(Math.max(0, Math.min(1439, goalStartMinuteRaw)) + 1, goalEndMinuteRaw)
                : normalizedSegmentEndMinute,
              goalStartMinute: hasExtendedGoal ? Math.max(0, Math.min(1439, goalStartMinuteRaw)) : null,
              goalEndMinute: hasExtendedGoal
                ? Math.max(Math.max(0, Math.min(1439, goalStartMinuteRaw)) + 1, goalEndMinuteRaw)
                : null,
              isPreferredBranch: false,
              colorIndex: 0,
              displayDurationMinutes: medianDurationMinutes,
              displayDurationText: formatTimelineDurationLabel(medianDurationMinutes),
            };
          });
        })
        .sort((a, b) => {
          if (b.windowDistinctDays !== a.windowDistinctDays) return b.windowDistinctDays - a.windowDistinctDays;
          if (b.distinctDays !== a.distinctDays) return b.distinctDays - a.distinctDays;
          if (b.totalMs !== a.totalMs) return b.totalMs - a.totalMs;
          if (b.sessionCount !== a.sessionCount) return b.sessionCount - a.sessionCount;
          if (a.bucketIndex !== b.bucketIndex) return a.bucketIndex - b.bucketIndex;
          return a.taskName.localeCompare(b.taskName);
        });

    getDashboardFilteredTasks().forEach((task) => {
      const taskId = String(task?.id || "").trim();
      if (!taskId) return;
      const timeGoalMinutes =
        !!task?.timeGoalEnabled && Number(task?.timeGoalMinutes || 0) > 0 ? Math.max(0, Number(task?.timeGoalMinutes || 0)) : 0;
      if (timeGoalMinutes > 0) timeGoalMinutesByTaskId.set(taskId, timeGoalMinutes);
      const taskName = String(task?.name || "").trim() || "Task";
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      entries.forEach((entry: any) => {
        const ts = ctx.normalizeHistoryTimestampMs(entry?.ts);
        const ms = Math.max(0, Number(entry?.ms) || 0);
        if (!Number.isFinite(ts) || ts <= 0 || ms < minimumSessionMs) return;
        if (ts < thirtyDaysAgoMs || ts > nowValue) return;
        const midpointMs = Math.max(thirtyDaysAgoMs, Math.min(nowValue, Math.round(ts - ms / 2)));
        const midpointDate = new Date(midpointMs);
        const isWeekendEntry = midpointDate.getDay() === 0 || midpointDate.getDay() === 6;
        const dayKey = localDayKey(midpointMs);
        fallbackMatchedDayKeys.add(dayKey);
        const minuteOfDay = midpointDate.getHours() * 60 + midpointDate.getMinutes() + midpointDate.getSeconds() / 60;
        const bucketIndex = Math.max(0, Math.min(23, Math.floor(minuteOfDay / bucketSizeMinutes)));
        addTimelineEntryToBucketMap(fallbackBucketMap, bucketIndex, taskId, taskName, dayKey, minuteOfDay, ms);
        if (isWeekendEntry !== showWeekendRoutine) return;
        matchedDayKeys.add(dayKey);
        addTimelineEntryToBucketMap(bucketMap, bucketIndex, taskId, taskName, dayKey, minuteOfDay, ms);
      });
    });

    const qualifyingActivityDayCount = fallbackMatchedDayKeys.size;
    const preferredBranchActivityDayCount = matchedDayKeys.size;
    const preferredItems = buildTimelineItems(bucketMap, preferredBranchMinimumDistinctDays);
    const fallbackItems = buildTimelineItems(fallbackBucketMap, fallbackMinimumDistinctDays);
    const bestItemsByTaskId = new Map<string, TimelineSuggestionItem>();
    const rankTimelineItem = (candidate: TimelineSuggestionItem, isPreferredBranch: boolean) => {
      const nextItem = { ...candidate, isPreferredBranch };
      const current = bestItemsByTaskId.get(candidate.taskId);
      if (!current) {
        bestItemsByTaskId.set(candidate.taskId, nextItem);
        return;
      }
      if (Number(isPreferredBranch) !== Number(current.isPreferredBranch)) {
        if (isPreferredBranch) bestItemsByTaskId.set(candidate.taskId, nextItem);
        return;
      }
      if (candidate.windowDistinctDays !== current.windowDistinctDays) {
        if (candidate.windowDistinctDays > current.windowDistinctDays) bestItemsByTaskId.set(candidate.taskId, nextItem);
        return;
      }
      if (candidate.distinctDays !== current.distinctDays) {
        if (candidate.distinctDays > current.distinctDays) bestItemsByTaskId.set(candidate.taskId, nextItem);
        return;
      }
      if (candidate.totalMs !== current.totalMs) {
        if (candidate.totalMs > current.totalMs) bestItemsByTaskId.set(candidate.taskId, nextItem);
        return;
      }
      if (candidate.sessionCount !== current.sessionCount) {
        if (candidate.sessionCount > current.sessionCount) bestItemsByTaskId.set(candidate.taskId, nextItem);
        return;
      }
      if (candidate.bucketIndex < current.bucketIndex) bestItemsByTaskId.set(candidate.taskId, nextItem);
    };
    preferredItems.forEach((item) => rankTimelineItem(item, true));
    fallbackItems.forEach((item) => rankTimelineItem(item, false));
    const items = Array.from(bestItemsByTaskId.values())
      .sort((a, b) => {
        if (a.suggestedMinute !== b.suggestedMinute) return a.suggestedMinute - b.suggestedMinute;
        if (a.maxStartMinute !== b.maxStartMinute) return a.maxStartMinute - b.maxStartMinute;
        if (b.distinctDays !== a.distinctDays) return b.distinctDays - a.distinctDays;
        if (b.totalMs !== a.totalMs) return b.totalMs - a.totalMs;
        return a.taskName.localeCompare(b.taskName);
      })
      .slice(0, targetCount)
      .map((item) => ({ ...item }));

    if (selectedTimelineSuggestionKey && !items.some((item) => item.selectionKey === selectedTimelineSuggestionKey)) {
      selectedTimelineSuggestionKey = null;
    }

    for (let index = 0; index < items.length - 1; index += 1) {
      const current = items[index]!;
      const next = items[index + 1]!;
      const boundaryMinute = Math.round((current.suggestedMinute + next.suggestedMinute) / 2);
      current.maxEndMinute = Math.min(current.maxEndMinute, boundaryMinute);
      next.maxStartMinute = Math.max(next.maxStartMinute, boundaryMinute);
    }

    items.forEach((item, index) => {
      const desiredDurationMinutes = Math.max(1, Math.round(item.avgDurationMs / 60000) || 1);
      const availableDurationMinutes = Math.max(1, item.maxEndMinute - item.maxStartMinute);
      const actualDurationMinutes = Math.min(desiredDurationMinutes, availableDurationMinutes);
      const centeredStartMinute = Math.round(item.suggestedMinute - actualDurationMinutes / 2);
      const segmentStartMinute = Math.max(
        item.maxStartMinute,
        Math.min(centeredStartMinute, Math.max(item.maxStartMinute, item.maxEndMinute - actualDurationMinutes))
      );
      item.segmentStartMinute = segmentStartMinute;
      item.segmentEndMinute = Math.min(item.maxEndMinute, segmentStartMinute + actualDurationMinutes);
      const hasGoalWindow = item.goalStartMinute != null && item.goalEndMinute != null && item.maxEndMinute > item.segmentEndMinute;
      item.goalStartMinute = hasGoalWindow ? item.maxStartMinute : null;
      item.goalEndMinute = hasGoalWindow ? item.maxEndMinute : null;
      item.colorIndex = index % 6;
    });
    const usingFallbackItems = items.some((item) => !item.isPreferredBranch);

    if (qualifyingActivityDayCount < minimumActivityDays) {
      if (shouldHoldDashboardWidget("timeline", false)) return;
      listEl.innerHTML = "";
      if (summaryEl) summaryEl.innerHTML = "";
      if (noteEl) noteEl.textContent = "";
      if (cardEl) {
        cardEl.setAttribute(
          "aria-description",
          `Timeline suggestions unavailable. ${qualifyingActivityDayCount} of ${minimumActivityDays} qualifying activity days found in the last 30 days.`
        );
      }
      ctx.getDashboardWidgetHasRenderedData().timeline = false;
      return;
    }

    if (!items.length) {
      if (shouldHoldDashboardWidget("timeline", false)) return;
      listEl.innerHTML = "";
      if (summaryEl) summaryEl.innerHTML = "";
      if (noteEl) noteEl.textContent = "";
      if (cardEl) {
        cardEl.setAttribute(
          "aria-description",
          preferredBranchActivityDayCount > 0
            ? `Timeline suggestions unavailable. ${qualifyingActivityDayCount} qualifying activity days were found, but recent ${showWeekendRoutine ? "weekend" : "weekday"} history is still too scattered across time windows.`
            : `Timeline suggestions unavailable. ${qualifyingActivityDayCount} qualifying activity days were found, but there is not enough consistent ${showWeekendRoutine ? "weekend" : "weekday"} history and broader history is still too scattered across time windows.`
        );
      }
      ctx.getDashboardWidgetHasRenderedData().timeline = false;
      return;
    }

    if (shouldHoldDashboardWidget("timeline", true)) return;

    const timelineHourLabels = ["12a", "4a", "8a", "12p", "4p", "8p", "12a"];
    const laneHtml = items
      .map((item) => {
        const timeText = getTimelineSegmentRangeLabel(item.segmentStartMinute, item.segmentEndMinute);
        const durationText = item.displayDurationText;
        const markerLeftPct = Math.max(0, Math.min(100, (item.suggestedMinute / 1440) * 100));
        const segmentStartPct = Math.max(0, Math.min(100, (item.segmentStartMinute / 1440) * 100));
        const segmentEndPct = Math.max(segmentStartPct, Math.min(100, (item.segmentEndMinute / 1440) * 100));
        const goalStartPct =
          item.goalStartMinute == null ? null : Math.max(0, Math.min(100, (item.goalStartMinute / 1440) * 100));
        const goalEndPct =
          item.goalEndMinute == null ? null : Math.max(goalStartPct || 0, Math.min(100, (item.goalEndMinute / 1440) * 100));
        const summaryText = `${item.taskName} around ${timeText}. Typical duration ${durationText}. Seen in this time window on ${
          item.windowDistinctDays
        } day${item.windowDistinctDays === 1 ? "" : "s"} in the last 30 days.`;
        const isSelected = item.selectionKey === selectedTimelineSuggestionKey;
        return `
          <div class="dashboardTimelineLane${isSelected ? " isSelected" : ""}">
            <div class="dashboardTimelineLaneInfo">
              <p class="dashboardTimelineLabel">${ctx.escapeHtmlUI(item.taskName)}</p>
              <span class="dashboardTimelineDuration">${ctx.escapeHtmlUI(durationText)}</span>
            </div>
            <div class="dashboardTimelineLaneTrack">
              ${
                goalStartPct != null && goalEndPct != null
                  ? `<span class="dashboardTimelineSegment dashboardTimelineSegmentGoal dashboardTimelineSegmentGoalColor-${item.colorIndex}" style="left:${goalStartPct.toFixed(
                      2
                    )}%;width:${Math.max(0, goalEndPct - goalStartPct).toFixed(2)}%;" aria-hidden="true"></span>`
                  : ""
              }
              <span class="dashboardTimelineSegment dashboardTimelineSegmentColor-${item.colorIndex}" style="left:${segmentStartPct.toFixed(
                2
              )}%;width:${Math.max(0, segmentEndPct - segmentStartPct).toFixed(2)}%;" aria-hidden="true"></span>
              <button
                class="dashboardTimelineMarkerBtn${isSelected ? " isSelected" : ""}"
                type="button"
                data-dashboard-timeline-key="${ctx.escapeHtmlUI(item.selectionKey)}"
                data-dashboard-timeline-message="${ctx.escapeHtmlUI(summaryText)}"
                style="left:${markerLeftPct.toFixed(2)}%;"
                aria-label="${ctx.escapeHtmlUI(summaryText)}"
                aria-pressed="${isSelected ? "true" : "false"}"
                title="${ctx.escapeHtmlUI(summaryText)}"
              >
                <span class="dashboardTimelineMarker" aria-hidden="true"></span>
              </button>
            </div>
          </div>
        `;
      })
      .join("");
    listEl.innerHTML = `
      <div class="dashboardTimelineTrackHours" aria-hidden="true">
        <span class="dashboardTimelineTrackHoursSpacer"></span>
        ${timelineHourLabels.map((label) => `<span>${ctx.escapeHtmlUI(label)}</span>`).join("")}
      </div>
      <div class="dashboardTimelineRows" role="list" aria-label="Suggested task timeline lanes">
        ${laneHtml}
      </div>
    `;
    if (summaryEl) {
      summaryEl.innerHTML = "";
    }
    if (noteEl) noteEl.textContent = "";
    if (cardEl) {
      cardEl.setAttribute(
        "aria-description",
        usingFallbackItems
          ? `Horizontal task timeline based on qualifying history from the last 30 days. Showing up to ${targetCount} suggested task markers and duration spans.`
          : `Horizontal ${showWeekendRoutine ? "weekend" : "weekday"} task timeline based on the last 30 days. Showing up to ${targetCount} suggested task markers and duration spans.`
      );
    }
  }

  function renderDashboardFocusTrend() {
    if (!hasAdvancedInsights()) {
      if (els.dashboardFocusTrendBars) {
        els.dashboardFocusTrendBars.innerHTML = '<div class="settingsDetailNote">Focus Trend is available on Pro.</div>';
      }
      if (els.dashboardFocusTrendAxis) els.dashboardFocusTrendAxis.innerHTML = "";
      return;
    }
    const cardEl = els.dashboardFocusTrendCard as HTMLElement | null;
    const barsEl = els.dashboardFocusTrendBars as HTMLElement | null;
    const axisEl = els.dashboardFocusTrendAxis as HTMLElement | null;
    const historyByTaskId = ctx.getHistoryByTaskId();
    if (!barsEl || !axisEl) return;

    const nowValue = nowMs();
    const includedTaskIds = getDashboardIncludedTaskIds();
    const today = new Date(nowValue);
    today.setHours(0, 0, 0, 0);

    const days = Array.from({ length: 7 }, (_, idx) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - idx));
      date.setHours(0, 0, 0, 0);
      return {
        startMs: date.getTime(),
        endMs: date.getTime() + 86400000,
        label: date.toLocaleDateString(undefined, { weekday: "narrow" }),
        longLabel: date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
        totalMs: 0,
      };
    });

    Object.keys(historyByTaskId || {}).forEach((taskIdRaw) => {
      const taskId = String(taskIdRaw || "").trim();
      if (!taskId) return;
      if (!isDashboardTaskIncluded(taskId, includedTaskIds)) return;
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      entries.forEach((entry: any) => {
        const ts = Number(entry?.ts);
        const ms = Number(entry?.ms);
        if (!Number.isFinite(ts) || !Number.isFinite(ms) || ms <= 0) return;
        for (const day of days) {
          if (ts >= day.startMs && ts < day.endMs) {
            day.totalMs += ms;
            break;
          }
        }
      });
    });

    const maxMs = days.reduce((max, day) => Math.max(max, day.totalMs), 0);
    const weekTotalMs = days.reduce((sum, day) => sum + day.totalMs, 0);
    if (shouldHoldDashboardWidget("focusTrend", weekTotalMs > 0)) return;
    const prevWeekStartMs = days[0]!.startMs - 7 * 86400000;
    const prevWeekEndMs = days[0]!.startMs;
    let prevWeekTotalMs = 0;

    Object.keys(historyByTaskId || {}).forEach((taskIdRaw) => {
      const taskId = String(taskIdRaw || "").trim();
      if (!taskId) return;
      if (!isDashboardTaskIncluded(taskId, includedTaskIds)) return;
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      entries.forEach((entry: any) => {
        const ts = Number(entry?.ts);
        const ms = Number(entry?.ms);
        if (!Number.isFinite(ts) || !Number.isFinite(ms) || ms <= 0) return;
        if (ts >= prevWeekStartMs && ts < prevWeekEndMs) prevWeekTotalMs += ms;
      });
    });

    barsEl.innerHTML = days
      .map((day) => {
        const ratio = maxMs > 0 ? day.totalMs / maxMs : 0;
        const aria = `${day.longLabel}: ${formatDashboardDurationShort(day.totalMs)}`;
        return `<span class="dashboardGraphDay" role="img" aria-label="${ctx.escapeHtmlUI(aria)}" title="${ctx.escapeHtmlUI(aria)}"><span class="dashboardGraphValue">${ctx.escapeHtmlUI(formatDashboardDurationShort(day.totalMs))}</span><span class="dashboardGraphBarWrap"><span class="dashboardGraphBar" style="height:${Math.round(ratio * 100)}%;"></span></span></span>`;
      })
      .join("");

    axisEl.innerHTML = days.map((day) => `<span>${ctx.escapeHtmlUI(day.label)}</span>`).join("");

    if (cardEl) {
      const deltaPct = prevWeekTotalMs > 0 ? Math.round(((weekTotalMs - prevWeekTotalMs) / prevWeekTotalMs) * 100) : null;
      const summary =
        deltaPct == null
          ? `Focus trend for the last 7 days. ${formatDashboardDurationShort(weekTotalMs)} logged.`
          : `Focus trend for the last 7 days. ${formatDashboardDurationShort(weekTotalMs)} logged, ${deltaPct >= 0 ? "+" : ""}${deltaPct}% vs previous 7 days.`;
      cardEl.setAttribute("aria-description", summary);
    }
  }

  function selectDashboardTimelineSuggestion(key: string | null) {
    selectedTimelineSuggestionKey = String(key || "").trim() || null;
    renderDashboardTimelineCard();
  }

  function selectDashboardMomentumDriver(key: DashboardMomentumDriverKey | string | null) {
    if (!hasAdvancedInsights()) return null;
    const nextKey = sanitizeMomentumDriverKey(key);
    if (!nextKey) return null;
    const momentum = computeMomentumSnapshot({
      tasks: ctx.getTasks(),
      historyByTaskId: ctx.getHistoryByTaskId(),
      weekStarting: ctx.getWeekStarting(),
      includedModes: ctx.getDashboardIncludedModes(),
      isModeEnabled: ctx.isModeEnabled,
      taskModeOf: ctx.taskModeOf,
      nowValue: nowMs(),
    });
    const message = buildMomentumDriverMessages(momentum)[nextKey] || null;
    selectedMomentumDriverKey = nextKey;
    clearSelectedMomentumDriverResetTimer();
    cancelMomentumAnimation();
    renderDashboardMomentumCard();
    selectedMomentumDriverResetTimerId = window.setTimeout(() => {
      selectedMomentumDriverResetTimerId = null;
      if (selectedMomentumDriverKey !== nextKey) return;
      selectedMomentumDriverKey = null;
      renderDashboardMomentumCard();
    }, MOMENTUM_DRIVER_AUTO_RESET_MS);
    return message;
  }

  function getDashboardHeatDaySummaryRows(dayKeyRaw: string) {
    const dayKey = String(dayKeyRaw || "").trim();
    const historyByTaskId = ctx.getHistoryByTaskId();
    const includedTaskIds = getDashboardIncludedTaskIds();
    const taskNameById = new Map<string, string>();
    getDashboardFilteredTasks().forEach((task) => {
      const taskId = String(task?.id || "").trim();
      if (!taskId) return;
      taskNameById.set(taskId, String(task?.name || "").trim() || "Task");
    });

    const rows: Array<{ taskId: string; taskName: string; totalMs: number }> = [];
    Object.keys(historyByTaskId || {}).forEach((taskIdRaw) => {
      const taskId = String(taskIdRaw || "").trim();
      if (!taskId || !includedTaskIds.has(taskId)) return;
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      if (!entries.length) return;
      const totalMs = entries.reduce((sum, entry: any) => {
        const ts = ctx.normalizeHistoryTimestampMs(entry?.ts);
        const ms = Math.max(0, Number(entry?.ms) || 0);
        if (!Number.isFinite(ts) || ms <= 0) return sum;
        return localDayKey(ts) === dayKey ? sum + ms : sum;
      }, 0);
      if (totalMs <= 0) return;
      rows.push({
        taskId,
        taskName: taskNameById.get(taskId) || "Task",
        totalMs,
      });
    });

    rows.sort((a, b) => {
      if (b.totalMs !== a.totalMs) return b.totalMs - a.totalMs;
      return a.taskName.localeCompare(b.taskName);
    });
    return rows;
  }

  function findDashboardHeatDayButton(dayKeyRaw: string): HTMLElement | null {
    const dayKey = String(dayKeyRaw || "").trim();
    if (!dayKey) return null;
    const grid = els.dashboardHeatCalendarGrid as HTMLElement | null;
    if (!grid) return null;
    try {
      const escaped =
        typeof (window as any).CSS !== "undefined" && typeof (window as any).CSS.escape === "function"
          ? (window as any).CSS.escape(dayKey)
          : dayKey.replace(/["\\]/g, "\\$&");
      return grid.querySelector(`.dashboardHeatDayCell.isInteractive[data-heat-date="${escaped}"]`) as HTMLElement | null;
    } catch {
      return grid.querySelector(`.dashboardHeatDayCell.isInteractive[data-heat-date="${dayKey}"]`) as HTMLElement | null;
    }
  }

  function setDashboardHeatFlipState(isFlipped: boolean) {
    const card = els.dashboardHeatCard as HTMLElement | null;
    const front = els.dashboardHeatFaceFront as HTMLElement | null;
    const back = els.dashboardHeatFaceBack as HTMLElement | null;
    card?.classList.toggle("isFlipped", isFlipped);
    if (front) {
      front.setAttribute("aria-hidden", isFlipped ? "true" : "false");
      if (isFlipped) front.setAttribute("inert", "");
      else front.removeAttribute("inert");
    }
    if (back) {
      back.setAttribute("aria-hidden", isFlipped ? "false" : "true");
      if (isFlipped) back.removeAttribute("inert");
      else back.setAttribute("inert", "");
    }
    if (els.dashboardHeatSummaryCloseBtn) {
      els.dashboardHeatSummaryCloseBtn.setAttribute("aria-expanded", isFlipped ? "true" : "false");
    }
  }

  function closeDashboardHeatSummaryCard(opts?: { restoreFocus?: boolean }) {
    setDashboardHeatFlipState(false);
    if (opts?.restoreFocus && dashboardHeatSelectedDayKey) {
      window.setTimeout(() => {
        findDashboardHeatDayButton(dashboardHeatSelectedDayKey)?.focus();
      }, 0);
    }
  }

  function openDashboardHeatSummaryCard(dayKeyRaw: string, dateLabelRaw: string) {
    const dayKey = String(dayKeyRaw || "").trim();
    if (!dayKey) return;
    const dateLabel = String(dateLabelRaw || "").trim() || dayKey;
    const rows = getDashboardHeatDaySummaryRows(dayKey);
    if (!rows.length) return;
    dashboardHeatSelectedDayKey = dayKey;
    if (els.dashboardHeatSummaryDate) {
      els.dashboardHeatSummaryDate.textContent = dateLabel;
    }
    if (els.dashboardHeatSummaryBody) {
      els.dashboardHeatSummaryBody.innerHTML = `
        <div class="dashboardHeatSummaryList" role="list" aria-label="Logged task time for ${ctx.escapeHtmlUI(dateLabel)}">
          ${rows
            .map(
              (row) => `<div class="dashboardHeatSummaryRow" role="listitem">
                <span class="dashboardHeatSummaryTask">${ctx.escapeHtmlUI(row.taskName)}</span>
                <span class="dashboardHeatSummaryTime">${ctx.escapeHtmlUI(formatTime(row.totalMs))}</span>
              </div>`
            )
            .join("")}
        </div>
      `;
    }
    setDashboardHeatFlipState(true);
    window.setTimeout(() => {
      try {
        els.dashboardHeatSummaryCloseBtn?.focus();
      } catch {
        // ignore focus failures
      }
    }, 0);
  }

  function renderDashboardHeatCalendar() {
    const monthLabelEl = els.dashboardHeatMonthLabel as HTMLElement | null;
    const weekdaysEl = els.dashboardHeatWeekdays as HTMLElement | null;
    const gridEl = els.dashboardHeatCalendarGrid as HTMLElement | null;
    const cardEl = els.dashboardHeatCard as HTMLElement | null;
    const historyByTaskId = ctx.getHistoryByTaskId();
    if (!gridEl) return;
    if (!hasAdvancedInsights()) {
      setDashboardPlanLockedState(cardEl, true);
      setDashboardHeatFlipState(false);
      renderLockedHeatmapMock(monthLabelEl, weekdaysEl, gridEl);
      return;
    }
    setDashboardPlanLockedState(cardEl, false);

    const nowValue = nowMs();
    const weekStarting = ctx.getWeekStarting();
    const dayLengthMs = 86400000;
    const totalSlots = 28;
    const currentWeekStartMs = startOfCurrentWeekMs(nowValue, weekStarting);
    const rangeStartMs = currentWeekStartMs - 21 * dayLengthMs;
    const rangeEndMs = currentWeekStartMs + 7 * dayLengthMs;
    const todayDate = new Date(nowValue);
    todayDate.setHours(0, 0, 0, 0);
    const todayStartMs = todayDate.getTime();

    if (monthLabelEl) {
      monthLabelEl.textContent = "Past 4 Weeks";
    }
    if (weekdaysEl) {
      weekdaysEl.innerHTML = getDashboardWeekdayLabels(weekStarting).map((label) => `<span>${ctx.escapeHtmlUI(label)}</span>`).join("");
    }

    const byDayMs = new Map<string, number>();
    const historyByDayMs = new Map<string, number>();
    const includedTaskIds = getDashboardIncludedTaskIds();
    Object.keys(historyByTaskId || {}).forEach((taskIdRaw) => {
      const taskId = String(taskIdRaw || "").trim();
      if (!taskId) return;
      if (!isDashboardTaskIncluded(taskId, includedTaskIds)) return;
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      entries.forEach((entry: any) => {
        const ts = ctx.normalizeHistoryTimestampMs(entry?.ts);
        const ms = Number(entry?.ms);
        if (!Number.isFinite(ts) || !Number.isFinite(ms) || ms <= 0) return;
        if (ts < rangeStartMs || ts >= rangeEndMs) return;
        const key = localDayKey(ts);
        byDayMs.set(key, (byDayMs.get(key) || 0) + ms);
        historyByDayMs.set(key, (historyByDayMs.get(key) || 0) + ms);
      });
    });

    getDashboardFilteredTasks().forEach((task) => {
      if (!task?.running || typeof task.startMs !== "number") return;
      const runStartMs = Math.max(rangeStartMs, Math.floor(task.startMs));
      const runEndMs = Math.min(rangeEndMs, nowValue);
      ctx.addRangeMsToLocalDayMap(byDayMs, runStartMs, runEndMs);
    });

    let maxDayMs = 0;
    byDayMs.forEach((v) => {
      if (v > maxDayMs) maxDayMs = v;
    });
    if (shouldHoldDashboardWidget("heatCalendar", maxDayMs > 0)) return;

    const html: string[] = [];

    for (let idx = 0; idx < totalSlots; idx += 1) {
      const dayDate = new Date(rangeStartMs + idx * dayLengthMs);
      dayDate.setHours(0, 0, 0, 0);
      if (dayDate.getTime() > todayStartMs) {
        html.push('<span class="dashboardHeatDayCell isFiller" aria-hidden="true"></span>');
        continue;
      }
      const key = localDayKey(dayDate.getTime());
      const dayMs = Math.max(0, byDayMs.get(key) || 0);
      const ratio = maxDayMs > 0 ? Math.max(0, Math.min(1, dayMs / maxDayMs)) : 0;
      const colorCss =
        dayMs > 0
          ? (() => {
              if (ratio <= 0.5) {
                const t = ratio / 0.5;
                const hue = 120 - 84 * t;
                const sat = 78 + 6 * t;
                const light = 42 + 6 * t;
                return `hsl(${Math.round(hue)} ${Math.round(sat)}% ${Math.round(light)}%)`;
              }
              const t = (ratio - 0.5) / 0.5;
              const hue = 36 - 32 * t;
              const sat = 84 + 6 * t;
              const light = 48 - 6 * t;
              return `hsl(${Math.round(hue)} ${Math.round(sat)}% ${Math.round(light)}%)`;
            })()
          : "";
      const activityLevel = dayMs <= 0 ? "none" : ratio < 0.34 ? "low" : ratio < 0.67 ? "medium" : "high";
      const dateText = dayDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      const durationText = formatDashboardDurationShort(dayMs);
      const aria = `${dateText}: ${durationText} of focused time`;
      const styleAttr = colorCss ? ` style="--heat-color:${colorCss}"` : "";
      const hasHistoryEntries = (historyByDayMs.get(key) || 0) > 0;
      html.push(
        hasHistoryEntries
          ? `<button class="dashboardHeatDayCell isActive isInteractive" type="button" data-activity-level="${activityLevel}" data-heat-date="${ctx.escapeHtmlUI(
              key
            )}" data-heat-date-label="${ctx.escapeHtmlUI(dateText)}" role="gridcell" aria-label="${ctx.escapeHtmlUI(aria)}" title="${ctx.escapeHtmlUI(
              aria
            )}"${styleAttr}><span class="dashboardHeatDayNum">${dayDate.getDate()}</span></button>`
          : `<span class="dashboardHeatDayCell${dayMs > 0 ? " isActive" : ""}" data-activity-level="${activityLevel}" role="gridcell" aria-label="${ctx.escapeHtmlUI(
              aria
            )}" title="${ctx.escapeHtmlUI(aria)}"${styleAttr}><span class="dashboardHeatDayNum">${dayDate.getDate()}</span></span>`
      );
    }

    gridEl.innerHTML = html.join("");
  }

  function getDashboardAvgSessionRows(range: DashboardAvgRange, nowValue: number) {
    const { startMs, endMs } = getDashboardAvgRangeWindow(range, nowValue);
    const taskNameById = new Map<string, string>();
    const filteredTasks = getDashboardFilteredTasks();
    const includedTaskIds = new Set<string>();
    const historyByTaskId = ctx.getHistoryByTaskId();
    const deletedTaskMeta = ctx.getDeletedTaskMeta();
    filteredTasks.forEach((task) => {
      const id = String(task.id || "").trim();
      if (!id) return;
      includedTaskIds.add(id);
      taskNameById.set(id, String(task.name || "").trim() || "Task");
    });

    const rows: Array<{ taskId: string; taskName: string; avgMs: number; count: number }> = [];
    Object.keys(historyByTaskId || {}).forEach((taskIdRaw) => {
      const taskId = String(taskIdRaw || "").trim();
      if (!taskId) return;
      if (!includedTaskIds.has(taskId)) return;
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      if (!entries.length) return;
      let sumMs = 0;
      let count = 0;
      entries.forEach((entry: any) => {
        const ts = Number(entry?.ts);
        const ms = Number(entry?.ms);
        if (!Number.isFinite(ts) || !Number.isFinite(ms) || ms <= 0) return;
        if (ts < startMs || ts > endMs) return;
        sumMs += ms;
        count += 1;
      });
      if (count < 1) return;
      const deletedName = String((deletedTaskMeta as any)?.[taskId]?.name || "").trim();
      const taskName = taskNameById.get(taskId) || deletedName || "Task";
      rows.push({ taskId, taskName, avgMs: sumMs / count, count });
    });

    rows.sort((a, b) => {
      if (b.avgMs !== a.avgMs) return b.avgMs - a.avgMs;
      const nameCmp = a.taskName.localeCompare(b.taskName);
      if (nameCmp !== 0) return nameCmp;
      return a.taskId.localeCompare(b.taskId);
    });
    return rows;
  }

  function truncateDashboardLabel(label: string, maxChars: number) {
    const clean = String(label || "").trim();
    if (clean.length <= maxChars) return clean;
    return `${clean.slice(0, Math.max(1, maxChars - 1))}...`;
  }

  function renderDashboardModeDistribution() {
    const donutEl = els.dashboardModeDonut as HTMLElement | null;
    const centerEl = els.dashboardModeDonutCenter as HTMLElement | null;
    const mode1LabelEl = els.dashboardMode1Label as HTMLElement | null;
    const mode2LabelEl = els.dashboardMode2Label as HTMLElement | null;
    const mode3LabelEl = els.dashboardMode3Label as HTMLElement | null;
    const mode1ValueEl = els.dashboardMode1Value as HTMLElement | null;
    const mode2ValueEl = els.dashboardMode2Value as HTMLElement | null;
    const mode3ValueEl = els.dashboardMode3Value as HTMLElement | null;

    if (mode1LabelEl) mode1LabelEl.textContent = ctx.getModeLabel("mode1");
    if (mode2LabelEl) mode2LabelEl.textContent = ctx.getModeLabel("mode2");
    if (mode3LabelEl) mode3LabelEl.textContent = ctx.getModeLabel("mode3");

    const totalsMs: Record<MainMode, number> = { mode1: 0, mode2: 0, mode3: 0 };
    getDashboardFilteredTasks().forEach((task) => {
      const mode = ctx.taskModeOf(task);
      totalsMs[mode] += Math.max(0, ctx.getElapsedMs(task));
    });
    const totalMs = totalsMs.mode1 + totalsMs.mode2 + totalsMs.mode3;
    if (shouldHoldDashboardWidget("modeDistribution", totalMs > 0)) return;

    const percentages: Record<MainMode, number> =
      totalMs > 0
        ? {
            mode1: (totalsMs.mode1 / totalMs) * 100,
            mode2: (totalsMs.mode2 / totalMs) * 100,
            mode3: (totalsMs.mode3 / totalMs) * 100,
          }
        : { mode1: 0, mode2: 0, mode3: 0 };

    if (mode1ValueEl) mode1ValueEl.textContent = `${Math.round(percentages.mode1)}%`;
    if (mode2ValueEl) mode2ValueEl.textContent = `${Math.round(percentages.mode2)}%`;
    if (mode3ValueEl) mode3ValueEl.textContent = `${Math.round(percentages.mode3)}%`;

    if (centerEl) {
      const dominantPct = Math.round(Math.max(percentages.mode1, percentages.mode2, percentages.mode3));
      centerEl.textContent = `${dominantPct}%`;
    }

    if (!donutEl) return;
    if (totalMs <= 0) {
      donutEl.style.background =
        "conic-gradient(var(--mode1-accent) 0 33.333%, var(--mode2-accent) 33.333% 66.666%, var(--mode3-accent) 66.666% 100%)";
      return;
    }
    const mode1End = percentages.mode1;
    const mode2End = percentages.mode1 + percentages.mode2;
    donutEl.style.background = `conic-gradient(var(--mode1-accent) 0 ${mode1End}%, var(--mode2-accent) ${mode1End}% ${mode2End}%, var(--mode3-accent) ${mode2End}% 100%)`;
  }

  let dashboardAvgSessionMeasureRetryPending = false;

  function renderDashboardAvgSessionChart() {
    const titleEl = els.dashboardAvgSessionTitle as HTMLElement | null;
    const emptyEl = els.dashboardAvgSessionEmpty as HTMLElement | null;
    const canvas = els.dashboardAvgSessionChart;
    const rangeLabelEl = document.getElementById("dashboardAvgRangeMenuLabel") as HTMLElement | null;
    const cardEl = canvas?.closest(".dashboardAvgSessionCard") as HTMLElement | null;
    const range = sanitizeDashboardAvgRange(ctx.getDashboardAvgRange());
    ctx.setDashboardAvgRange(range);

    if (titleEl) titleEl.textContent = `Avg Session by Task (${dashboardAvgRangeLabel(range)})`;
    if (rangeLabelEl) rangeLabelEl.textContent = dashboardAvgRangeLabel(range);

    if (!canvas) return;
    const wrap = canvas.closest(".historyCanvasWrap") as HTMLElement | null;
    if (!wrap) return;
    if (!hasAdvancedInsights()) {
      setDashboardPlanLockedState(cardEl, true);
      if (titleEl) titleEl.textContent = "Avg Session by Task (Example)";
      if (rangeLabelEl) rangeLabelEl.textContent = "Past 7 Days";
      renderLockedAvgSessionMock(canvas, wrap, emptyEl);
      return;
    }
    setDashboardPlanLockedState(cardEl, false);
    const rows = getDashboardAvgSessionRows(range, nowMs());
    if (shouldHoldDashboardWidget("avgSession", rows.length > 0)) return;

    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const measuredWidth = Math.floor(rect.width || wrap.clientWidth || canvas.clientWidth || 0);
    const measuredHeight = Math.floor(rect.height || wrap.clientHeight || canvas.clientHeight || 0);
    if (measuredWidth <= 0 || measuredHeight <= 0) {
      if (!dashboardAvgSessionMeasureRetryPending) {
        dashboardAvgSessionMeasureRetryPending = true;
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            dashboardAvgSessionMeasureRetryPending = false;
            renderDashboardAvgSessionChart();
          });
        });
      }
      if (measuredWidth <= 0) return;
    }
    const fallbackHeight = Math.max(176, Math.min(236, Math.round(measuredWidth * 0.62)));
    const width = measuredWidth;
    const height = measuredHeight > 0 ? measuredHeight : fallbackHeight;
    wrap.style.minHeight = measuredHeight > 0 ? "" : `${fallbackHeight}px`;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = "100%";
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    if (!rows.length) {
      if (emptyEl) emptyEl.style.display = "block";
      return;
    }
    if (emptyEl) emptyEl.style.display = "none";

    const chartTop = 14;
    const chartBottom = height - 56;
    const chartHeight = Math.max(80, chartBottom - chartTop);
    const maxAvgMs = Math.max(...rows.map((row) => row.avgMs), 1);
    const tickCount = 4;
    const tickLabelFont = "10px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    context.font = tickLabelFont;
    let maxTickLabelWidth = 0;
    for (let i = 1; i <= tickCount; i += 1) {
      const pct = i / tickCount;
      const tickMs = maxAvgMs * pct;
      maxTickLabelWidth = Math.max(maxTickLabelWidth, context.measureText(formatDashboardDurationShort(tickMs)).width);
    }
    const chartLeft = 12 + Math.ceil(maxTickLabelWidth) + 10;
    const chartRight = width - 12;
    const chartWidth = Math.max(120, chartRight - chartLeft);
    const barCount = rows.length;
    const gap = barCount > 10 ? 4 : 8;
    const labelMaxChars = width <= 420 ? 8 : 13;
    const labelFont = "10px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    context.font = labelFont;
    const longestLabelWidth = rows.reduce((maxWidth, row) => {
      const label = truncateDashboardLabel(row.taskName, labelMaxChars);
      return Math.max(maxWidth, context.measureText(label).width);
    }, 0);
    const preferredBarWidth = Math.ceil(longestLabelWidth + 10);
    const maxBarWidthByChart = Math.max(8, Math.floor((chartWidth - gap * (barCount - 1)) / Math.max(1, barCount)));
    const barWidth = Math.max(8, Math.min(preferredBarWidth, maxBarWidthByChart));
    const startX = chartLeft;

    context.strokeStyle = "rgba(255,255,255,.20)";
    context.fillStyle = "rgba(255,255,255,.68)";
    context.font = tickLabelFont;
    context.textAlign = "right";
    context.textBaseline = "middle";
    for (let i = 0; i <= tickCount; i += 1) {
      const pct = i / tickCount;
      const y = Math.round(chartBottom - chartHeight * pct) + 0.5;
      context.globalAlpha = i === 0 ? 0.5 : 0.24;
      context.beginPath();
      context.moveTo(chartLeft, y);
      context.lineTo(chartRight, y);
      context.stroke();
      context.globalAlpha = 1;
      if (i === 0) continue;
      const tickMs = maxAvgMs * pct;
      context.fillText(formatDashboardDurationShort(tickMs), chartLeft - 6, y);
    }

    rows.forEach((row, idx) => {
      const ratio = Math.max(0, Math.min(1, row.avgMs / maxAvgMs));
      const x = startX + idx * (barWidth + gap);
      const barHeight = Math.max(2, Math.round(chartHeight * ratio));
      const y = chartBottom - barHeight;
      const rowTask = ctx.getTasks().find((task) => String(task.id || "") === String(row.taskId));
      const rowStaticColor = rowTask ? ctx.getModeColor("mode1") : "rgb(0,207,200)";
      const rowDynamicColor = rowTask ? sessionColorForTaskMs(rowTask as any, row.avgMs) : rowStaticColor;
      context.fillStyle = ctx.getDynamicColorsEnabled() ? rowDynamicColor : rowStaticColor;
      context.globalAlpha = 0.92;
      context.fillRect(x, y, barWidth, barHeight);
      context.globalAlpha = 1;

      const label = truncateDashboardLabel(row.taskName, labelMaxChars);
      context.save();
      context.translate(x + barWidth / 2, chartBottom + 10);
      context.rotate((-42 * Math.PI) / 180);
      context.textAlign = "right";
      context.textBaseline = "middle";
      context.fillStyle = "rgba(255,255,255,.72)";
      context.font = labelFont;
      context.fillText(label, 0, 0);
      context.restore();
    });
  }

  function renderDashboardWidgets(opts?: { includeAvgSession?: boolean }) {
    renderDashboardTodayHoursCard();
    renderDashboardWeeklyGoalsCard();
    renderDashboardTasksCompletedCard();
    renderDashboardTimelineCard();
    renderDashboardFocusTrend();
    if (opts?.includeAvgSession !== false) renderDashboardAvgSessionChart();
    renderDashboardHeatCalendar();
    try {
      renderDashboardMomentumCard();
    } catch {
      // Keep the rest of the dashboard stable if Momentum rendering fails.
    }
  }

  function renderDashboardLiveWidgets() {
    renderDashboardTodayHoursCard();
    renderDashboardWeeklyGoalsCard();
    try {
      renderDashboardMomentumCard();
    } catch {
      // Keep the rest of the dashboard stable if Momentum rendering fails.
    }
  }

  return {
    renderDashboardMomentumCard,
    renderDashboardWeeklyGoalsCard,
    renderDashboardTasksCompletedCard,
    renderDashboardTodayHoursCard,
    renderDashboardTimelineCard,
    renderDashboardFocusTrend,
    renderDashboardHeatCalendar,
    renderDashboardModeDistribution,
    renderDashboardAvgSessionChart,
    renderDashboardLiveWidgets,
    renderDashboardWidgets,
    selectDashboardTimelineSuggestion,
    selectDashboardMomentumDriver,
    clearDashboardMomentumDriverSelection,
    hasSelectedDashboardMomentumDriver,
    openDashboardHeatSummaryCard,
    closeDashboardHeatSummaryCard,
  };
}
