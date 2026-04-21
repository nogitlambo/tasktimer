export type OnboardingDashboardTimelineItem = {
  taskName: string;
  label: string;
  duration: string;
  leftPct: number;
  widthPct: number;
  colorIndex: number;
};

export type OnboardingDashboardHeatLevel = "none" | "low" | "medium" | "high";

export type OnboardingDashboardPreviewData = {
  xpProgress: {
    totalXp: number;
    progressPct: number;
    xpToNext: number;
  };
  today: {
    totalMs: number;
    trendPct: number;
    goalTotalMs: number;
    loggedMs: number;
    projectedMs: number;
    runningMs: number;
    deltaLabel: string;
  };
  weeklyGoals: {
    totalMs: number;
    trendPct: number;
    goalTotalMs: number;
    loggedMs: number;
    projectedMs: number;
    runningMs: number;
    progressLabel: string;
  };
  tasksCompleted: {
    total: number;
    dailyCompletedDays: number;
    weeklyCompletedTasks: number;
    metaLabel: string;
  };
  momentum: {
    score: number;
    statusLabel: string;
    driverScores: [number, number, number, number];
    summaryMessage: string;
    driverMessages: {
      recentActivity: string;
      consistency: string;
      weeklyProgress: string;
      liveBonus: string;
    };
  };
  timeline: {
    note: string;
    summaryTitle: string;
    summaryMeta: [string, string, string];
    items: OnboardingDashboardTimelineItem[];
  };
  heatmap: {
    monthLabel: string;
    levels: OnboardingDashboardHeatLevel[];
  };
};

export const ONBOARDING_DASHBOARD_PREVIEW: OnboardingDashboardPreviewData = {
  xpProgress: {
    totalXp: 1240,
    progressPct: 68,
    xpToNext: 160,
  },
  today: {
    totalMs: 2 * 60 * 60 * 1000 + 15 * 60 * 1000,
    trendPct: 18,
    goalTotalMs: 3 * 60 * 60 * 1000,
    loggedMs: 2 * 60 * 60 * 1000 + 15 * 60 * 1000,
    projectedMs: 2 * 60 * 60 * 1000 + 45 * 60 * 1000,
    runningMs: 30 * 60 * 1000,
    deltaLabel: "+25m vs this time yesterday",
  },
  weeklyGoals: {
    totalMs: 9 * 60 * 60 * 1000 + 45 * 60 * 1000,
    trendPct: 22,
    goalTotalMs: 12 * 60 * 60 * 1000,
    loggedMs: 9 * 60 * 60 * 1000 + 45 * 60 * 1000,
    projectedMs: 10 * 60 * 60 * 1000 + 15 * 60 * 1000,
    runningMs: 30 * 60 * 1000,
    progressLabel: "81% of weekly goal logged",
  },
  tasksCompleted: {
    total: 6,
    dailyCompletedDays: 4,
    weeklyCompletedTasks: 2,
    metaLabel: "4 daily, 2 weekly",
  },
  momentum: {
    score: 74,
    statusLabel: "High",
    driverScores: [19, 31, 15, 9],
    summaryMessage: "Momentum is high at 74/100, driven by steady activity, a strong streak, and live focus time.",
    driverMessages: {
      recentActivity: "Recent Activity contributed 19 of 25 momentum points from strong focus sessions over the last three days.",
      consistency: "Consistency contributed 31 of 45 momentum points from multiple active days and a healthy trailing streak.",
      weeklyProgress: "Weekly Progress contributed 15 of 20 momentum points from strong progress against this week's goal.",
      liveBonus: "Live Bonus contributed 9 of 10 momentum points because a focus session is active right now.",
    },
  },
  timeline: {
    note: "Example onboarding timeline preview",
    summaryTitle: "A sample day built around your focus rhythm",
    summaryMeta: ["Deep-work windows", "Admin recovery blocks", "Study time pacing"],
    items: [
      { taskName: "Deep Work", label: "08:30 - 10:00", duration: "1h 30m", leftPct: 13, widthPct: 19, colorIndex: 0 },
      { taskName: "Admin", label: "10:30 - 11:15", duration: "45m", leftPct: 29, widthPct: 10, colorIndex: 2 },
      { taskName: "Study", label: "14:00 - 15:30", duration: "1h 30m", leftPct: 58, widthPct: 18, colorIndex: 1 },
    ],
  },
  heatmap: {
    monthLabel: "Past 4 Weeks",
    levels: [
      "low", "none", "medium", "none", "high", "medium", "none",
      "medium", "low", "high", "medium", "none", "low", "none",
      "none", "medium", "high", "medium", "low", "none", "low",
      "medium", "none", "high", "medium", "low", "none", "medium",
    ],
  },
};
