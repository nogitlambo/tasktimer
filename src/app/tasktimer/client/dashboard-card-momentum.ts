import { formatDashboardDurationShort } from "../lib/historyChart";
import { getMomentumBandLabel, type MomentumSnapshot } from "../lib/momentum";
import type { DashboardMomentumDriverKey } from "./types";

export function buildMomentumDriverMessages(momentum: MomentumSnapshot) {
  const recentQualifiedLabels = Array.isArray(momentum.recentQualifiedLabels) ? momentum.recentQualifiedLabels : [];
  const selectedDaysSummary = String(momentum.selectedDaysSummary || "all days");
  const recentText = recentQualifiedLabels.length ? recentQualifiedLabels.join(", ") : "no qualifying recent days";
  const weeklyPct = momentum.currentWeekGoalMs > 0 ? Math.round((momentum.currentWeekLoggedMs / momentum.currentWeekGoalMs) * 100) : null;
  const consistencyMessage =
    momentum.trailingStreak >= 2
      ? `Consistency contributed ${Math.round(momentum.consistencyScore)} of 45 momentum points from ${momentum.activeDayCount} active day${momentum.activeDayCount === 1 ? "" : "s"} this week and a ${momentum.trailingStreak}-occurrence streak across ${selectedDaysSummary.toLowerCase()}.`
      : `Consistency contributed 0 of 45 momentum points because streak scoring starts at 2 selected-day occurrences. You currently have ${momentum.activeDayCount} active day${momentum.activeDayCount === 1 ? "" : "s"} this week and a ${momentum.trailingStreak}-occurrence streak across ${selectedDaysSummary.toLowerCase()}.`;
  return {
    recentActivity: `Recent Activity contributed ${Math.round(momentum.recentActivityScore)} of 25 momentum points from ${recentText}, using your selected optimal days (${selectedDaysSummary.toLowerCase()}) plus a 5-minute minimum session threshold.`,
    consistency: consistencyMessage,
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

export function getPrimaryMomentumDriverKey(momentum: MomentumSnapshot): DashboardMomentumDriverKey {
  const driverScores: ReadonlyArray<readonly [DashboardMomentumDriverKey, number]> = [
    ["recentActivity", momentum.recentActivityScore],
    ["consistency", momentum.consistencyScore],
    ["weeklyProgress", momentum.weeklyProgressScore],
    ["liveBonus", momentum.activeSessionBonus],
  ];

  let leadingDriver: DashboardMomentumDriverKey = "recentActivity";
  let leadingScore = Number.NEGATIVE_INFINITY;
  driverScores.forEach(([key, score]) => {
    if (score > leadingScore) {
      leadingDriver = key;
      leadingScore = score;
    }
  });
  return leadingDriver;
}

export function buildMomentumSummaryMessage(momentum: MomentumSnapshot) {
  const roundedScore = Math.round(momentum.score);
  const bandLabel = getMomentumBandLabel(roundedScore);
  const primaryDriverKey = getPrimaryMomentumDriverKey(momentum);
  const driverMessages = buildMomentumDriverMessages(momentum);
  const driverSummary = driverMessages[primaryDriverKey];
  return `Momentum is ${bandLabel.toLowerCase()} at ${roundedScore}/100. ${driverSummary}`;
}
