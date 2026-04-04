import { loadHistory, loadTasks } from "./storage";
import type { HistoryByTaskId, Task } from "./types";

export type ArchieAssistantMode = "app_help" | "data_explainer" | "navigation_hint" | "unknown";

export type ArchieSuggestedAction =
  | { kind: "navigate"; label: string; href: string }
  | { kind: "openSettingsPane"; label: string; pane: ArchieSettingsPane }
  | { kind: "jumpToTask"; label: string; taskId: string };

export type ArchieSettingsPane =
  | "general"
  | "preferences"
  | "appearance"
  | "notifications"
  | "privacy"
  | "userGuide"
  | "about"
  | "feedback"
  | "data"
  | "reset";

type ArchieAppPage = "tasks" | "dashboard" | "friends" | "settings" | "feedback" | "userGuide" | "unknown";
type ArchieModeKey = "mode1" | "mode2" | "mode3";

type ArchieTask = Task & { mode?: ArchieModeKey | string | null };

export type ArchieAssistantContext = {
  currentAppPage: ArchieAppPage;
  tasks: ArchieTask[];
  historyByTaskId: HistoryByTaskId;
  modeLabels: Record<ArchieModeKey, string>;
  modeEnabled: Record<ArchieModeKey, boolean>;
  runningTasks: ArchieTask[];
};

type ArchieIntent =
  | { mode: "app_help"; topic: "modes" | "history" | "dashboard" | "settings" | "appearance" | "account" | "rewards" | "userGuide" }
  | { mode: "data_explainer"; topic: "current_work" | "most_history" | "most_used_mode" | "recent_progress" | "check_next" }
  | { mode: "navigation_hint"; topic: "history" | "dashboard" | "settings" | "userGuide" }
  | { mode: "unknown" };

export type ArchieAssistantResponse = {
  mode: ArchieAssistantMode;
  message: string;
  suggestedAction?: ArchieSuggestedAction;
};

const DEFAULT_MODE_LABELS: Record<ArchieModeKey, string> = {
  mode1: "Mode 1",
  mode2: "Mode 2",
  mode3: "Mode 3",
};

function normalizeQuestion(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[?!.,]+$/g, "")
    .replace(/\s+/g, " ");
}

function formatElapsedShort(totalMs: number) {
  const safeMs = Math.max(0, Math.floor(Number(totalMs) || 0));
  const totalMinutes = Math.floor(safeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function humanJoin(values: string[]) {
  const items = values.map((value) => String(value || "").trim()).filter(Boolean);
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function normalizeModeKey(value: unknown): ArchieModeKey {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "mode2") return "mode2";
  if (normalized === "mode3") return "mode3";
  return "mode1";
}

function normalizeCurrentAppPage(activePage: string): ArchieAppPage {
  if (activePage === "dashboard") return "dashboard";
  if (activePage === "tasks") return "tasks";
  if (activePage === "test2") return "friends";
  if (activePage === "settings") return "settings";
  if (typeof window !== "undefined") {
    const pathname = String(window.location.pathname || "").toLowerCase();
    if (pathname.includes("/feedback")) return "feedback";
    if (pathname.includes("/user-guide")) return "userGuide";
    if (pathname.includes("/settings")) return "settings";
    if (pathname.includes("/history-manager")) return "settings";
  }
  return "unknown";
}

function getModeSettings() {
  const labels = { ...DEFAULT_MODE_LABELS };
  const enabled = { mode1: true, mode2: false, mode3: false };
  return { labels, enabled };
}

export function buildArchieContext(activePage: string): ArchieAssistantContext {
  const tasks = (loadTasks() || []) as ArchieTask[];
  const historyByTaskId = loadHistory() || {};
  const { labels, enabled } = getModeSettings();
  return {
    currentAppPage: normalizeCurrentAppPage(activePage),
    tasks,
    historyByTaskId,
    modeLabels: labels,
    modeEnabled: enabled,
    runningTasks: tasks.filter((task) => !!task?.running),
  };
}

export function interpretArchieQuestion(text: string, context: ArchieAssistantContext): ArchieIntent {
  void context;
  const q = normalizeQuestion(text);
  if (!q) return { mode: "unknown" };

  if (q.includes("what is your name") || q.includes("what's your name") || q.includes("your name")) {
    return { mode: "unknown" };
  }

  if (q.includes("category") || q.includes("categories") || q.includes("mode") || q.includes("modes")) {
    return { mode: "app_help", topic: "modes" };
  }
  if (q.includes("history manager") || q.includes("view history") || q.includes("show history") || q === "history") {
    return { mode: "app_help", topic: "history" };
  }
  if (q.includes("dashboard card") || q.includes("streak") || q.includes("momentum") || q.includes("heatmap") || q.includes("timeline") || q.includes("avg session") || q.includes("average session") || q.includes("tasks completed") || q.includes("today") || q.includes("this week")) {
    return { mode: "app_help", topic: "dashboard" };
  }
  if (q.includes("appearance") || q.includes("theme")) {
    return { mode: "app_help", topic: "appearance" };
  }
  if (q.includes("account") || q.includes("profile")) {
    return { mode: "app_help", topic: "account" };
  }
  if (q.includes("reward") || q.includes("rank") || q.includes("xp")) {
    return { mode: "app_help", topic: "rewards" };
  }
  if (q.includes("user guide") || q.includes("help center") || q.includes("help")) {
    return { mode: "app_help", topic: "userGuide" };
  }
  if (q.includes("setting") || q.includes("preferences")) {
    return { mode: "app_help", topic: "settings" };
  }

  if (q.includes("currently working") || q.includes("working on") || q.includes("running task")) {
    return { mode: "data_explainer", topic: "current_work" };
  }
  if (q.includes("most history") || q.includes("most logged") || q.includes("most time")) {
    return { mode: "data_explainer", topic: "most_history" };
  }
  if (q.includes("using most") || q.includes("use most") || q.includes("most used mode")) {
    return { mode: "data_explainer", topic: "most_used_mode" };
  }
  if (q.includes("progress") || q.includes("momentum look like") || q.includes("recent momentum") || q.includes("recent progress")) {
    return { mode: "data_explainer", topic: "recent_progress" };
  }
  if (q.includes("check next") || q.includes("work on next") || q.includes("next task") || q.includes("what next")) {
    return { mode: "data_explainer", topic: "check_next" };
  }

  if (q.includes("go to history")) return { mode: "navigation_hint", topic: "history" };
  if (q.includes("go to dashboard")) return { mode: "navigation_hint", topic: "dashboard" };
  if (q.includes("go to settings")) return { mode: "navigation_hint", topic: "settings" };
  if (q.includes("open user guide")) return { mode: "navigation_hint", topic: "userGuide" };

  return { mode: "unknown" };
}

function getTaskMode(task: ArchieTask) {
  return normalizeModeKey(task?.mode);
}

function buildModeUsage(context: ArchieAssistantContext) {
  const totals: Record<ArchieModeKey, number> = { mode1: 0, mode2: 0, mode3: 0 };
  const taskById = new Map(context.tasks.map((task) => [String(task.id || ""), task] as const));
  Object.entries(context.historyByTaskId).forEach(([taskId, rows]) => {
    const task = taskById.get(taskId);
    const mode = task ? getTaskMode(task) : "mode1";
    totals[mode] += (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + Math.max(0, Number(row?.ms || 0)), 0);
  });
  return totals;
}

function getMostHistoryTask(
  context: ArchieAssistantContext,
): { task: ArchieTask; totalMs: number; sessionCount: number } | null {
  let best: { task: ArchieTask; totalMs: number; sessionCount: number } | null = null;
  context.tasks.forEach((task) => {
    const rows = Array.isArray(context.historyByTaskId[String(task.id || "")]) ? context.historyByTaskId[String(task.id || "")] : [];
    const totalMs = rows.reduce((sum, row) => sum + Math.max(0, Number(row?.ms || 0)), 0);
    if (!totalMs) return;
    if (!best || totalMs > best.totalMs) {
      best = { task, totalMs, sessionCount: rows.length };
    }
  });
  return best;
}

function getRecentProgress(context: ArchieAssistantContext) {
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  let currentWindowMs = 0;
  let previousWindowMs = 0;
  Object.values(context.historyByTaskId).forEach((rows) => {
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const ts = Number(row?.ts || 0);
      const ms = Math.max(0, Number(row?.ms || 0));
      if (!ts || !ms) return;
      const age = now - ts;
      if (age >= 0 && age < sevenDaysMs) currentWindowMs += ms;
      else if (age >= sevenDaysMs && age < sevenDaysMs * 2) previousWindowMs += ms;
    });
  });
  return { currentWindowMs, previousWindowMs };
}

function getNextSuggestedTask(context: ArchieAssistantContext) {
  if (context.runningTasks.length) return context.runningTasks[0];
  const byId = new Map<string, number>();
  Object.entries(context.historyByTaskId).forEach(([taskId, rows]) => {
    const lastTs = (Array.isArray(rows) ? rows : []).reduce((max, row) => Math.max(max, Number(row?.ts || 0)), 0);
    byId.set(taskId, lastTs);
  });
  const tasks = context.tasks.filter((task) => !task.running);
  if (!tasks.length) return null;
  tasks.sort((a, b) => {
    const aLast = byId.get(String(a.id || "")) || 0;
    const bLast = byId.get(String(b.id || "")) || 0;
    if (aLast !== bLast) return aLast - bLast;
    return Number(a.order || 0) - Number(b.order || 0);
  });
  return tasks[0] || null;
}

function fallbackResponse(): ArchieAssistantResponse {
  return {
    mode: "unknown",
    message:
      "I can help with history, dashboard cards, current work, top history, or recent progress. Try asking what you are working on or how to view history.",
  };
}

export function respondToArchieIntent(intent: ArchieIntent, context: ArchieAssistantContext): ArchieAssistantResponse {
  if (intent.mode === "app_help") {
    if (intent.topic === "modes") {
      const activeModes = (["mode1", "mode2", "mode3"] as ArchieModeKey[])
        .filter((mode) => context.modeEnabled[mode])
        .map((mode) => context.modeLabels[mode]);
      return {
        mode: "app_help",
        message: `TaskTimer now uses a single task list. ${humanJoin(activeModes)} has been flattened into one shared workspace.`,
        suggestedAction: { kind: "navigate", label: "Open Tasks", href: "/tasklaunch" },
      };
    }
    if (intent.topic === "history") {
      return {
        mode: "app_help",
        message:
          "Open History on any task for quick session bars, or use History Manager in Settings for bulk review, sorting, and cleanup across all tasks.",
        suggestedAction: { kind: "navigate", label: "Open History Manager", href: "/tasklaunch/history-manager" },
      };
    }
    if (intent.topic === "dashboard") {
      return {
        mode: "app_help",
        message:
          "Dashboard cards summarize your progress over time. Streak tracks consistency, Momentum reflects recent logged activity, Heatmap shows busy days, and Timeline suggests how your day could be structured.",
        suggestedAction: { kind: "navigate", label: "Open Dashboard", href: "/tasklaunch/dashboard" },
      };
    }
    if (intent.topic === "appearance") {
      return {
        mode: "app_help",
        message:
          "Appearance settings let you switch theme, change the menu and button style, and control whether progress visuals use dynamic colors.",
        suggestedAction: { kind: "openSettingsPane", label: "Open Appearance", pane: "appearance" },
      };
    }
    if (intent.topic === "account") {
      return {
        mode: "app_help",
        message:
          "Your account area is where you manage profile details, plan status, avatar, rank badge, and account-level actions like sign-out or account deletion.",
        suggestedAction: { kind: "openSettingsPane", label: "Open Account", pane: "general" },
      };
    }
    if (intent.topic === "rewards") {
      return {
        mode: "app_help",
        message:
          "Rewards are driven by XP from your logged work. The profile card shows current XP and rank progress, and the rank badge opens the ladder for a fuller view.",
        suggestedAction: { kind: "openSettingsPane", label: "Open Account", pane: "general" },
      };
    }
    if (intent.topic === "userGuide") {
      return {
        mode: "app_help",
        message:
          "The User Guide walks through core flows like tasks, timers, checkpoints, history, focus mode, settings, and backup tools.",
        suggestedAction: { kind: "navigate", label: "Open User Guide", href: "/tasklaunch/user-guide" },
      };
    }
    if (intent.topic === "settings") {
      return {
        mode: "app_help",
        message:
          "Settings is the control center for account, preferences, appearance, notifications, data tools, feedback, and support links.",
        suggestedAction: { kind: "navigate", label: "Open Settings", href: "/tasklaunch/settings" },
      };
    }
  }

  if (intent.mode === "navigation_hint") {
    if (intent.topic === "history") {
      return {
        mode: "navigation_hint",
        message: "I can take you to History Manager for the full history view.",
        suggestedAction: { kind: "navigate", label: "Open History Manager", href: "/tasklaunch/history-manager" },
      };
    }
    if (intent.topic === "dashboard") {
      return {
        mode: "navigation_hint",
        message: "Dashboard is the best place to review streaks, momentum, heatmap activity, and timeline suggestions.",
        suggestedAction: { kind: "navigate", label: "Open Dashboard", href: "/tasklaunch/dashboard" },
      };
    }
    if (intent.topic === "settings") {
      return {
        mode: "navigation_hint",
        message: "Settings gives you access to account controls, preferences, appearance, and data tools.",
        suggestedAction: { kind: "navigate", label: "Open Settings", href: "/tasklaunch/settings" },
      };
    }
    if (intent.topic === "userGuide") {
      return {
        mode: "navigation_hint",
        message: "The User Guide is a good place to browse feature walkthroughs without changing any settings.",
        suggestedAction: { kind: "navigate", label: "Open User Guide", href: "/tasklaunch/user-guide" },
      };
    }
  }

  if (intent.mode === "data_explainer") {
    if (intent.topic === "current_work") {
      if (!context.runningTasks.length) {
        return {
          mode: "data_explainer",
          message: "Nothing is actively running right now. If you want, I can help you pick a task to jump back into next.",
        };
      }
      const names = context.runningTasks.slice(0, 3).map((task) => task.name);
      const firstTask = context.runningTasks[0];
      return {
        mode: "data_explainer",
        message: `You are currently tracking ${humanJoin(names)}.`,
        suggestedAction: firstTask?.id ? { kind: "jumpToTask", label: `Jump To ${firstTask.name}`, taskId: firstTask.id } : undefined,
      };
    }
    if (intent.topic === "most_history") {
      const best = getMostHistoryTask(context);
      if (!best) {
        return {
          mode: "data_explainer",
          message: "I do not have any completed history to compare yet. Log a few sessions and I can point out your heaviest task.",
        };
      }
      return {
        mode: "data_explainer",
        message: `${best.task.name} has the most logged history so far with ${formatElapsedShort(best.totalMs)} across ${best.sessionCount} session${best.sessionCount === 1 ? "" : "s"}.`,
        suggestedAction: { kind: "jumpToTask", label: `Open ${best.task.name}`, taskId: best.task.id },
      };
    }
    if (intent.topic === "most_used_mode") {
      const totals = buildModeUsage(context);
      const winner = (Object.keys(totals) as ArchieModeKey[]).sort((a, b) => totals[b] - totals[a])[0];
      const totalMs = totals[winner];
      if (!totalMs) {
        return {
          mode: "data_explainer",
          message: "I do not have enough completed history to compare usage patterns yet.",
        };
      }
      return {
        mode: "data_explainer",
        message: `Your older task history is concentrated most heavily in ${context.modeLabels[winner]}, with ${formatElapsedShort(totalMs)} logged there.`,
        suggestedAction: { kind: "navigate", label: "Open Dashboard", href: "/tasklaunch/dashboard" },
      };
    }
    if (intent.topic === "recent_progress") {
      const { currentWindowMs, previousWindowMs } = getRecentProgress(context);
      if (!currentWindowMs && !previousWindowMs) {
        return {
          mode: "data_explainer",
          message: "I do not have enough completed sessions yet to summarize your recent progress.",
          suggestedAction: { kind: "navigate", label: "Open Dashboard", href: "/tasklaunch/dashboard" },
        };
      }
      if (!previousWindowMs) {
        return {
          mode: "data_explainer",
          message: `You logged ${formatElapsedShort(currentWindowMs)} in the last 7 days. That gives us a clean starting point for your momentum trend.`,
          suggestedAction: { kind: "navigate", label: "Open Dashboard", href: "/tasklaunch/dashboard" },
        };
      }
      const deltaMs = currentWindowMs - previousWindowMs;
      const direction = deltaMs >= 0 ? "up" : "down";
      return {
        mode: "data_explainer",
        message: `You logged ${formatElapsedShort(currentWindowMs)} in the last 7 days, which is ${direction} ${formatElapsedShort(Math.abs(deltaMs))} compared with the previous week.`,
        suggestedAction: { kind: "navigate", label: "Open Dashboard", href: "/tasklaunch/dashboard" },
      };
    }
    if (intent.topic === "check_next") {
      const nextTask = getNextSuggestedTask(context);
      if (!nextTask) {
        return {
          mode: "data_explainer",
          message: "I do not have a task to recommend yet. Add a task first, then I can suggest where to focus next.",
        };
      }
      if (nextTask.running) {
        return {
          mode: "data_explainer",
          message: `${nextTask.name} is already active, so that is the clearest thing to return to next.`,
          suggestedAction: { kind: "jumpToTask", label: `Jump To ${nextTask.name}`, taskId: nextTask.id },
        };
      }
      return {
        mode: "data_explainer",
        message: `A good next check-in is ${nextTask.name}. It is the task that looks most ready for attention based on your current local history.`,
        suggestedAction: { kind: "jumpToTask", label: `Open ${nextTask.name}`, taskId: nextTask.id },
      };
    }
  }

  return fallbackResponse();
}

export function resolveArchieAssistantResponse(question: string, activePage: string): ArchieAssistantResponse {
  const normalized = normalizeQuestion(question);
  if (!normalized) return fallbackResponse();
  if (
    normalized === "what is your name" ||
    normalized === "whats your name" ||
    normalized === "what's your name" ||
    normalized.includes("your name")
  ) {
    return { mode: "unknown", message: "My name is Archie." };
  }
  if (normalized === "what can you help with" || normalized === "what can i ask" || normalized === "help") {
    return {
      mode: "app_help",
      message:
        "I can explain history, dashboard cards, settings, current work, top history, and recent progress.",
      suggestedAction: { kind: "navigate", label: "Open User Guide", href: "/tasklaunch/user-guide" },
    };
  }
  const context = buildArchieContext(activePage);
  const intent = interpretArchieQuestion(question, context);
  return respondToArchieIntent(intent, context);
}
